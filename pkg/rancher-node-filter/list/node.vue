<script lang="ts">
/**
 * Node list: verbatim copy of Rancher's shell/list/node.vue (identical in Rancher 2.13.1 and 2.14.3) plus
 * - label key/value filter (server-side labelSelector when the list is paginated), off by default
 * - Disk % column from Prometheus node_exporter
 * - Display fix on Rancher's CPU / RAM columns (see FEATURES.md "Native display fixes"): same columns,
 *   position, format and sort, but the value is live usage / allocatable from metrics.k8s.io, i.e. the
 *   same number as `kubectl top nodes` and as the node detail page. Rancher's own value reads steve's
 *   metrics cache (can be days old with vai) and divides RAM by capacity on the list but by allocatable
 *   on the detail page.
 *
 * The Pods column works exactly like Rancher's: pods are loaded into the store and kept live by the
 * websocket watch, and cleared again when the list is left (forgetType) so no other page sees them.
 */
import PaginatedResourceTable from '@shell/components/PaginatedResourceTable.vue';
import Tag from '@shell/components/Tag.vue';
import Banner from '@components/Banner/Banner.vue';
import { PODS } from '@shell/config/table-headers';
import { CAPI as CAPI_ANNOTATIONS } from '@shell/config/labels-annotations';

import { defineComponent } from 'vue';
import { ActionFindPageArgs } from '@shell/types/store/dashboard-store.types';
import { FilterArgs, PaginationFilterField, PaginationParamFilter } from '@shell/types/store/pagination.types';

import {
  CAPI, MANAGEMENT, METRIC, NODE, NORMAN, POD
} from '@shell/config/types';
import { COLUMN_BREAKPOINTS } from '@shell/types/store/type-map';

import { mapGetters } from 'vuex';
import { PagTableFetchPageSecondaryResourcesOpts, PagTableFetchSecondaryResourcesOpts, PagTableFetchSecondaryResourcesReturns } from '@shell/types/components/paginatedResourceTable';

import PrometheusSettings from '../components/PrometheusSettings.vue';
import { isSystemLabel } from '../types/node-filter';
import {
  subscribeNodeMetrics, subscribeDiskMetrics, nodeUsage, diskUsageByIp, diskMetricsState, nodeMetricsState, resetDiskMetrics
} from '../services/metrics-store';
import { parseQuantity, toMillicores } from '../utils/quantity';
import { defineSortKey, sortablePercent, sortGenerationWith } from '../utils/sort-keys';

/** Node labels rarely change; refresh the dropdown options when they are older than this */
const LABELS_MAX_AGE_MS = 60000;

function percent(used: number | undefined, total: number): number | undefined {
  if (used === undefined || !total) {
    return undefined;
  }

  return (used * 100) / total;
}

/** PercentageBar formatter input: '' renders as N/A */
function percentString(value: number | undefined): string {
  return value === undefined ? '' : `${ value }`;
}

const SORT_KEY_CPU = 'nodeFilterCpuPercent';
const SORT_KEY_RAM = 'nodeFilterRamPercent';
const SORT_KEY_DISK = 'nodeFilterDiskPercent';

export default defineComponent({
  name: 'ListNode',

  components: {
    PaginatedResourceTable,
    Tag,
    Banner,
    PrometheusSettings,
  },

  props: {
    resource: {
      type:     String,
      required: true,
    },

    schema: {
      type:     Object,
      required: true,
    },

    useQueryParamsForSimpleFiltering: {
      type:    Boolean,
      default: false
    },

    listComponent: {
      type:    Boolean,
      default: false
    }
  },

  data() {
    return {
      // Pods column (running pods / capacity)
      canViewPods:        !!this.$store.getters[`cluster/schemaFor`](POD),
      // Norman node required for Drain/Cordon/Uncordon action
      canViewNormanNodes: !!this.$store.getters[`rancher/schemaFor`](NORMAN.NODE),
      // Mgmt Node required to find Norman node
      canViewMgmtNodes:   !!this.$store.getters[`management/schemaFor`](MANAGEMENT.NODE),
      // Required for ssh / download key actions
      canViewMachines:    !!this.$store.getters[`management/schemaFor`](CAPI.MACHINE),
      // metrics-server is installed (CPU and RAM columns)
      canViewNodeMetrics: !!this.$store.getters['cluster/schemaFor'](METRIC.NODE),

      // Label filter
      selectedLabelKey:   '',
      selectedLabelValue: '',
      /** labels of every node, used for the dropdown options only */
      nodeLabels:         [] as Record<string, string>[],
      labelsFetchedAt:    0,

      releaseFns: [] as (() => void)[],

      // Adds the live sort keys to every row and re-sorts when live numbers change (see utils/sort-keys.ts)
      sortGenerationFn: sortGenerationWith(
        () => this.decorateRowsForSort(),
        () => nodeMetricsState.fetchedAt,
        () => diskMetricsState.fetchedAt
      ),
    };
  },

  mounted() {
    const clusterId = this.$store.getters['clusterId'];

    if (this.canViewNodeMetrics) {
      this.releaseFns.push(subscribeNodeMetrics(this.$store, clusterId));
    }
    this.releaseFns.push(subscribeDiskMetrics(this.$store, clusterId));

    this.loadNodeLabels();
  },

  beforeUnmount() {
    this.releaseFns.forEach((release) => release());
    this.releaseFns = [];
    // Same as Rancher's node list: stop watching and drop pods / nodes, so the pods loaded for the
    // Pods column never leak into other pages (e.g. a Deployment's pod list)
    if (this.canViewPods) {
      this.$store.dispatch('cluster/forgetType', POD);
    }
    this.$store.dispatch('cluster/forgetType', NODE);
  },

  computed: {
    ...mapGetters(['currentCluster']),

    kubeNodes(): any[] {
      // Note if server side pagination is used this is only the current page
      return this.$store.getters[`cluster/all`](this.resource) || [];
    },

    hasWindowsNodes(): boolean {
      return this.kubeNodes.some((node: any) => node.status?.nodeInfo?.operatingSystem === 'windows');
    },

    canPaginate(): boolean {
      const args = { id: (this.resource as any)?.id || this.resource };

      return !!this.resource && !!this.$store.getters[`cluster/paginationEnabled`]?.(args);
    },

    headers(): any[] {
      return this.decorateHeaders(this.$store.getters['type-map/headersFor'](this.schema, false), false);
    },

    paginationHeaders(): any[] {
      if (!this.canPaginate) {
        return [];
      }

      const paginationHeaders = this.$store.getters['type-map/headersFor'](this.schema, true);

      if (!paginationHeaders) {
        console.warn('Nodes list expects pagination headers but none found'); // eslint-disable-line no-console

        return [];
      }

      return this.decorateHeaders(paginationHeaders, true);
    },

    // ---- label filter -----------------------------------------------------

    labelKeyOptions(): string[] {
      const keys = new Set<string>();

      this.nodeLabels.forEach((labels) => Object.keys(labels).forEach((key) => {
        if (!isSystemLabel(key)) {
          keys.add(key);
        }
      }));

      return [...keys].sort();
    },

    labelValueOptions(): string[] {
      if (!this.selectedLabelKey) {
        return [];
      }

      const values = new Set<string>();

      this.nodeLabels.forEach((labels) => {
        const value = labels[this.selectedLabelKey];

        if (value !== undefined) {
          values.add(value);
        }
      });

      return [...values].sort();
    },

    hasActiveFilter(): boolean {
      return !!(this.selectedLabelKey && this.selectedLabelValue);
    },

    /** Changing it re-creates the table so the first page is fetched with the new filter */
    filterKey(): string {
      return this.hasActiveFilter ? `${ this.selectedLabelKey }=${ this.selectedLabelValue }` : 'all';
    },

    matchingNodeCount(): number {
      return this.nodeLabels.filter((labels) => labels[this.selectedLabelKey] === this.selectedLabelValue).length;
    },

    diskForbidden(): boolean {
      return diskMetricsState.status === 'forbidden';
    },
  },

  watch: {
    selectedLabelKey(neu: string) {
      this.selectedLabelValue = '';
      if (neu && this.labelValueOptions.length === 1) {
        this.selectedLabelValue = this.labelValueOptions[0];
      }
    },

  },

  methods: {
    decorateHeaders(base: any[], paginated: boolean): any[] {
      // Display fix: Rancher's CPU / RAM columns keep name, position, formatter and sortability, only the
      // value becomes live (and the sort follows it). Paginated headers are not sortable in Rancher either.
      // Note: SortableTable renders `col.value` (path or function) and ignores `getValue`.
      const cpu = (row: any) => percentString(this.cpuPercent(row));
      const ram = (row: any) => percentString(this.ramPercent(row));
      const headers = base.map((h: any) => {
        if (h.name === 'cpu') {
          return {
            ...h, ...(paginated ? {} : { sort: [SORT_KEY_CPU] }), value: cpu, getValue: cpu
          };
        }
        if (h.name === 'ram') {
          return {
            ...h, ...(paginated ? {} : { sort: [SORT_KEY_RAM] }), value: ram, getValue: ram
          };
        }

        return h;
      });

      const ramIndex = headers.findIndex((h: any) => h.name === 'ram');
      const disk = (row: any) => percentString(this.diskPercent(row));

      headers.splice(ramIndex >= 0 ? ramIndex + 1 : headers.length - 1, 0, {
        name:       'disk',
        labelKey:   'node.list.disk',
        value:      disk,
        formatter:  'PercentageBar',
        breakpoint: COLUMN_BREAKPOINTS.LAPTOP,
        width:      120,
        sort:       paginated ? false : [SORT_KEY_DISK],
        search:     false,
        getValue:   disk,
      });

      // Rancher's own Pods column (running pods in the store / capacity), live via the websocket watch
      if (this.canViewPods) {
        headers.splice(headers.length - 1, 0, {
          ...PODS,
          breakpoint: COLUMN_BREAKPOINTS.DESKTOP,
          ...(paginated ? { sort: false, search: false } : {}),
          getValue:   (row: any) => row.podConsumedUsage,
        });
      }

      return headers;
    },

    /** Numeric sort keys for the live CPU / RAM / Disk values (client-side sort only) */
    decorateRowsForSort(): void {
      this.kubeNodes.forEach((row: any) => {
        defineSortKey(row, SORT_KEY_CPU, (r) => sortablePercent(this.cpuPercent(r)));
        defineSortKey(row, SORT_KEY_RAM, (r) => sortablePercent(this.ramPercent(r)));
        defineSortKey(row, SORT_KEY_DISK, (r) => sortablePercent(this.diskPercent(r)));
      });
    },

    /** Same formula as `kubectl top nodes` and the node detail page: usage / allocatable */
    cpuPercent(row: any): number | undefined {
      return percent(nodeUsage(row.id)?.cpu, toMillicores(row.status?.allocatable?.cpu));
    },

    ramPercent(row: any): number | undefined {
      return percent(nodeUsage(row.id)?.memory, parseQuantity(row.status?.allocatable?.memory));
    },

    diskPercent(row: any): number | undefined {
      return diskUsageByIp(row.internalIp);
    },

    // ---- label filter -----------------------------------------------------

    async loadNodeLabels(): Promise<void> {
      try {
        const clusterId = this.$store.getters['clusterId'];
        const res = await this.$store.dispatch('cluster/request', { url: `/k8s/clusters/${ clusterId }/v1/nodes?exclude=metadata.managedFields&exclude=spec&exclude=status` });

        this.nodeLabels = (res?.data || []).map((node: any) => node.metadata?.labels || {});
        this.labelsFetchedAt = Date.now();
      } catch (err) {
        console.warn('[NodeList] Failed to load node labels:', err); // eslint-disable-line no-console
      }
    },

    refreshLabelsIfStale(): void {
      if (Date.now() - this.labelsFetchedAt > LABELS_MAX_AGE_MS) {
        this.loadNodeLabels();
      }
    },

    clearLabelFilter(): void {
      this.selectedLabelKey = '';
      this.selectedLabelValue = '';
    },

    /** Server-side filter (paginated). Mutates the per-request copy of the pagination settings */
    apiFilter(pagination: any): any {
      if (this.hasActiveFilter) {
        pagination.labelSelector = { matchLabels: { [this.selectedLabelKey]: this.selectedLabelValue } };
      }

      return pagination;
    },

    /** Client-side filter (not paginated, every node is already loaded) */
    localFilter(rows: any[]): any[] {
      if (!this.hasActiveFilter) {
        return rows;
      }

      return rows.filter((row: any) => row.metadata?.labels?.[this.selectedLabelKey] === this.selectedLabelValue);
    },

    onPrometheusSaved(): void {
      resetDiskMetrics();
    },

    toggleLabels(row: any) {
      row['displayLabels'] = !row.displayLabels;
    },

    /**
     * of type PagTableFetchSecondaryResources (server-side pagination disabled)
     */
    async fetchSecondaryResources({ canPaginate }: PagTableFetchSecondaryResourcesOpts): PagTableFetchSecondaryResourcesReturns {
      if (canPaginate) {
        return;
      }
      const promises = [];

      if (this.canViewMgmtNodes) {
        promises.push(this.$store.dispatch(`management/findAll`, { type: MANAGEMENT.NODE }));
      }

      if (this.canViewNormanNodes) {
        promises.push(this.$store.dispatch(`rancher/findAll`, { type: NORMAN.NODE }));
      }

      if (this.canViewMachines) {
        promises.push(this.$store.dispatch(`management/findAll`, { type: CAPI.MACHINE }));
      }

      if (this.canViewPods) {
        // No need to block on this (live via websocket watch, cleared in beforeUnmount)
        this.$store.dispatch(`cluster/findAll`, { type: POD });
      }

      await Promise.all(promises);
    },

    /**
     * Fetch only what the current page needs (server-side pagination enabled)
     *
     * of type PagTableFetchPageSecondaryResources
     */
    async fetchPageSecondaryResources({ force, page }: PagTableFetchPageSecondaryResourcesOpts) {
      if (!page?.length) {
        return;
      }

      if (this.canViewMgmtNodes && this.canViewNormanNodes) {
        this.$store.dispatch(`rancher/findAll`, { type: NORMAN.NODE });

        // We only fetch mgmt node to get norman node. We only fetch node to get node actions
        // See https://github.com/rancher/dashboard/issues/10743
        const opt: ActionFindPageArgs = {
          force,
          pagination: new FilterArgs({
            filters: PaginationParamFilter.createMultipleFields(page.map((r: any) => new PaginationFilterField({
              field: 'status.nodeName',
              value: r.id
            }))),
          })
        };

        this.$store.dispatch(`management/findPage`, { type: MANAGEMENT.NODE, opt });
      }

      if (this.canViewMachines) {
        const namespace = this.currentCluster.provClusterId?.split('/')[0];

        if (namespace) {
          const opt: ActionFindPageArgs = {
            force,
            namespaced: namespace,
            pagination: new FilterArgs({
              filters: PaginationParamFilter.createMultipleFields(
                page.reduce((res: PaginationFilterField[], r: any ) => {
                  const name = r.metadata?.annotations?.[CAPI_ANNOTATIONS.MACHINE_NAME];

                  if (name) {
                    res.push(new PaginationFilterField({
                      field: 'metadata.name',
                      value: name,
                    }));
                  }

                  return res;
                }, [])
              )
            })
          };

          this.$store.dispatch(`management/findPage`, { type: CAPI.MACHINE, opt });
        }
      }

      if (this.canViewPods) {
        // Pods of the nodes on this page only. Rancher re-fetches them when pods change (resource.changes watch)
        const opt: ActionFindPageArgs = {
          force,
          pagination: new FilterArgs({
            filters: PaginationParamFilter.createMultipleFields(
              page.map((r: any) => new PaginationFilterField({
                field: 'spec.nodeName',
                value: r.id,
              }))
            )
          })
        };

        this.$store.dispatch(`cluster/findPage`, { type: POD, opt });
      }
    },
  },
});
</script>

<template>
  <div>
    <div class="label-filter-section mb-20">
      <div class="filter-row">
        <div class="label-key-select">
          <label class="text-label">{{ t('node.list.labelFilter.labelKey') }}</label>
          <select
            v-model="selectedLabelKey"
            class="form-control"
            @focus="refreshLabelsIfStale"
          >
            <option
              value=""
              disabled
            >
              {{ t('node.list.labelFilter.selectLabelKey') }}
            </option>
            <option
              v-for="key in labelKeyOptions"
              :key="key"
              :value="key"
            >
              {{ key }}
            </option>
          </select>
        </div>

        <div class="label-value-select">
          <label class="text-label">{{ t('node.list.labelFilter.labelValue') }}</label>
          <select
            v-model="selectedLabelValue"
            :disabled="!selectedLabelKey"
            class="form-control"
          >
            <option
              value=""
              disabled
            >
              {{ t('node.list.labelFilter.selectLabelValue') }}
            </option>
            <option
              v-for="value in labelValueOptions"
              :key="value"
              :value="value"
            >
              {{ value }}
            </option>
          </select>
        </div>

        <button
          v-if="selectedLabelKey || selectedLabelValue"
          class="btn role-secondary clear-filter-btn"
          @click="clearLabelFilter"
        >
          {{ t('node.list.labelFilter.clear') }}
        </button>

        <PrometheusSettings @saved="onPrometheusSaved" />
      </div>

      <div
        v-if="hasActiveFilter"
        class="filter-info"
      >
        <i class="icon icon-info" />
        <span>
          {{ t('node.list.labelFilter.filteringBy', {
            key: selectedLabelKey,
            value: selectedLabelValue,
            count: matchingNodeCount
          }) }}
        </span>
      </div>
    </div>

    <Banner
      v-if="diskForbidden"
      color="warning"
      class="mb-20"
    >
      <div>
        <strong>{{ t('node.list.prometheus.insufficientPermissions') }}</strong>
        <p>{{ t('node.list.prometheus.rbacWarning') }}</p>
      </div>
    </Banner>

    <Banner
      v-if="hasWindowsNodes"
      color="info"
      :label="t('cluster.custom.registrationCommand.windowsWarning')"
    />

    <PaginatedResourceTable
      :key="filterKey"
      v-bind="$attrs"
      :schema="schema"
      :headers="headers"
      :paginationHeaders="paginationHeaders"
      :sub-rows="true"
      :fetchSecondaryResources="fetchSecondaryResources"
      :fetchPageSecondaryResources="fetchPageSecondaryResources"
      :api-filter="apiFilter"
      :local-filter="localFilter"
      :sort-generation-fn="sortGenerationFn"
      :use-query-params-for-simple-filtering="useQueryParamsForSimpleFiltering"
      data-testid="cluster-node-list"
    >
      <template #sub-row="{fullColspan, row, onRowMouseEnter, onRowMouseLeave}">
        <tr
          class="taints sub-row"
          :class="{'empty-taints': ! row.displayTaintsAndLabels}"
          @mouseenter="onRowMouseEnter"
          @mouseleave="onRowMouseLeave"
        >
          <template v-if="row.displayTaintsAndLabels">
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td :colspan="fullColspan-2">
              <span v-if="row.spec.taints && row.spec.taints.length">
                {{ t('node.list.nodeTaint') }}:
                <Tag
                  v-for="(taint, i) in row.spec.taints"
                  :key="i"
                  class="mr-5 mt-2"
                >
                  {{ taint.key }}={{ taint.value }}:{{ taint.effect }}
                </Tag>
              </span>
              <span
                v-if="!!row.customLabelCount"
                class="mt-5"
              > {{ t('node.list.nodeLabels') }}:
                <span
                  v-for="(label, i) in row.customLabels"
                  :key="i"
                  class="mt-5 labels"
                >
                  <Tag
                    v-if="i < 7"
                    class="mr-2 label"
                  >
                    {{ label }}
                  </Tag>
                  <Tag
                    v-else-if="i > 6 && row.displayLabels"
                    class="mr-2 label"
                  >
                    {{ label }}
                  </Tag>
                </span>
                <a
                  v-if="row.customLabelCount > 7"
                  href="#"
                  @click.prevent="toggleLabels(row)"
                >
                  {{ t(`node.list.${row.displayLabels? 'hideLabels' : 'showLabels'}`) }}
                </a>
              </span>
            </td>
          </template>
          <td
            v-else
            :colspan="fullColspan"
          >
&nbsp;
          </td>
        </tr>
      </template>
    </PaginatedResourceTable>
  </div>
</template>

<style lang='scss' scoped>
.label-filter-section {
  background: var(--box-bg);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  padding: 15px;

  .filter-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;

    .label-key-select,
    .label-value-select {
      flex: 1;
      min-width: 200px;
      max-width: 300px;

      .text-label {
        display: block;
        margin-bottom: 5px;
        font-size: 14px;
        font-weight: 500;
        color: var(--input-label);
      }

      .form-control {
        width: 100%;
        height: 40px;
        padding: 0 10px;
        border: 1px solid var(--border);
        border-radius: var(--border-radius);
        background: var(--input-bg);
        color: var(--input-text);
        font-size: 14px;

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: var(--disabled-bg);
        }

        &:focus {
          outline: none;
          border-color: var(--primary);
        }
      }
    }

    .clear-filter-btn {
      height: 40px;
      padding: 0 15px;
      white-space: nowrap;
    }

    .prometheus-settings {
      margin-left: auto;
    }
  }

  .filter-info {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--primary);
    font-size: 14px;
  }
}

.labels {
  display: inline;
  flex-wrap: wrap;

  .label {
    display: inline-block;
    margin-top: 2px;
  }
}

.taints {
  td {
    padding-top:0;
    .tag {
      margin-right: 5px;
      display: inline-block;
      margin-top: 2px;
    }
  }
  &.empty-taints {
    // No taints... so hide sub-row (but not bottom-border)
    height: 0;
    line-height: 0;
    td {
      padding: 0;
    }
  }
}
</style>
