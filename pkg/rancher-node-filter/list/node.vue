<script lang="ts">
import PaginatedResourceTable from '@shell/components/PaginatedResourceTable.vue';
import ResourceTable from '@shell/components/ResourceTable.vue';
import Tag from '@shell/components/Tag.vue';
import { Banner } from '@components/Banner';
import { PODS } from '@shell/config/table-headers';
import metricPoller from '@shell/mixins/metric-poller';

import { CAPI as CAPI_ANNOTATIONS } from '@shell/config/labels-annotations.js';

import { defineComponent } from 'vue';
import { ActionFindPageArgs } from '@shell/types/store/dashboard-store.types';
import { FilterArgs, PaginationFilterField, PaginationParamFilter } from '@shell/types/store/pagination.types';

import {
  CAPI,
  MANAGEMENT, METRIC, NODE, NORMAN, POD
} from '@shell/config/types';
import { GROUP_RESOURCES, mapPref } from '@shell/store/prefs';
import { COLUMN_BREAKPOINTS } from '@shell/types/store/type-map';

import { mapGetters } from 'vuex';
import { PagTableFetchPageSecondaryResourcesOpts, PagTableFetchSecondaryResourcesOpts, PagTableFetchSecondaryResourcesReturns } from '@shell/types/components/paginatedResourceTable';
import LabeledSelect from '@shell/components/form/LabeledSelect.vue';
import { isSystemLabel, matchesLabelFilter, type NodeResource } from '../types/node-filter';

export default defineComponent({
  name: 'ListNode',

  components: {
    PaginatedResourceTable,
    ResourceTable,
    Tag,
    Banner,
    LabeledSelect
  },

  mixins: [metricPoller],

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
      // Pods required for `Pods` column's running pods metrics
      // podConsumedUsage = podConsumed / podConsumedUsage. podConsumed --> pods. allPods.filter((pod) => pod.spec.nodeName === this.name)
      canViewPods:        !!this.$store.getters[`cluster/schemaFor`](POD),
      // Norman node required for Drain/Cordon/Uncordon action
      canViewNormanNodes: !!this.$store.getters[`rancher/schemaFor`](NORMAN.NODE),
      // Mgmt Node required to find Norman node
      canViewMgmtNodes:   !!this.$store.getters[`management/schemaFor`](MANAGEMENT.NODE),
      // Required for ssh / download key actions
      canViewMachines:    !!this.$store.getters[`management/schemaFor`](CAPI.MACHINE),
      // Required for CPU and RAM columns
      canViewNodeMetrics: !!this.$store.getters['cluster/schemaFor'](METRIC.NODE),
      
      // Label filter state
      selectedLabelKey: null,
      labelValue: '',
      allLabelKeys: [] as string[],
    };
  },

  beforeUnmount() {
    // Stop watching pods, nodes and node metrics
    if (this.canViewPods) {
      this.$store.dispatch('cluster/forgetType', POD);
    }

    this.$store.dispatch('cluster/forgetType', NODE);
    this.$store.dispatch('cluster/forgetType', METRIC.NODE);
  },

  computed: {
    ...mapGetters(['currentCluster']),

    kubeNodes() {
      // Get nodes from store
      // Note: when server-side pagination is used, this only contains the current page
      // When label filter is active, all nodes are loaded via ensureAllNodesLoaded()
      return this.$store.getters[`cluster/all`](this.resource) || [];
    },

    hasWindowsNodes() {
      // Note if server side pagination is used this is only applicable to the current page
      return (this.kubeNodes || []).some((node: any) => node.status.nodeInfo.operatingSystem === 'windows');
    },

    tableGroup: mapPref(GROUP_RESOURCES),

    canPaginate() {
      const args = { id: this.resource?.id || this.resource };

      return this.resource && this.$store.getters[`cluster/paginationEnabled`]?.(args);
    },

    headers() {
      // This is all about adding the pods column... if the user can see pods
      const headers = [...this.$store.getters['type-map/headersFor'](this.schema, false)];

      if (this.canViewPods) {
        headers.splice(headers.length - 1, 0, {
          ...PODS,
          breakpoint: COLUMN_BREAKPOINTS.DESKTOP,
          getValue:   (row: any) => row.podConsumedUsage
        });
      }

      return headers;
    },

    paginationHeaders() {
      // This is all about adding the pods column... if the user can see pods

      if (!this.canPaginate) {
        return [];
      }

      const paginationHeaders = [...this.$store.getters['type-map/headersFor'](this.schema, true)];

      if (paginationHeaders) {
        if (this.canViewPods) {
          paginationHeaders.splice(paginationHeaders.length - 1, 0, {
            ...PODS,
            breakpoint: COLUMN_BREAKPOINTS.DESKTOP,
            sort:       false,
            search:     false,
            getValue:   (row: any) => row.podConsumedUsage
          });
        }

        return paginationHeaders;
      } else {
        console.warn('Nodes list expects pagination headers but none found'); // eslint-disable-line no-console

        return [];
      }
    },

    // Check if label filter is active
    hasActiveFilter() {
      return !!(this.selectedLabelKey && this.labelValue.trim());
    },

    // All available label keys from all nodes
    labelKeyOptions() {
      const keys = new Set<string>();
      
      // Get all nodes to extract label keys
      const allNodes = this.$store.getters[`cluster/all`](this.resource) || [];
      
      allNodes.forEach((node: NodeResource) => {
        const labels = node.metadata?.labels || {};
        Object.keys(labels).forEach(key => {
          // Filter out kubernetes system labels for cleaner UX
          if (!isSystemLabel(key)) {
            keys.add(key);
          }
        });
      });

      return Array.from(keys).sort().map(key => ({
        label: key,
        value: key
      }));
    },

    // Filtered nodes based on label selection
    filteredRows() {
      if (!this.selectedLabelKey || !this.labelValue.trim()) {
        return this.kubeNodes;
      }

      return this.kubeNodes.filter((node: NodeResource) => {
        return matchesLabelFilter(node, this.selectedLabelKey, this.labelValue);
      });
    }
  },

  methods: {
    async loadMetrics() {
      if (!this.canViewNodeMetrics) {
        return;
      }

      if (this.canPaginate) {
        if (!this.kubeNodes.length) {
          return;
        }

        const opt: ActionFindPageArgs = {
          force:      true,
          pagination: new FilterArgs({
            filters: new PaginationParamFilter({
              fields: this.kubeNodes.map((r: any) => new PaginationFilterField({
                field: 'metadata.name',
                value: r.id
              }))
            })
          })
        };

        await this.$store.dispatch('cluster/findPage', {
          type: METRIC.NODE,
          opt
        });
      } else {
        await this.$store.dispatch('cluster/findAll', {
          type: METRIC.NODE,
          opt:  { force: true }
        });
      }

      this.$forceUpdate();
    },

    toggleLabels(row: any) {
      row['displayLabels'] = !row.displayLabels;
    },

    /**
     * of type PagTableFetchSecondaryResources
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
        // No need to block on this
        this.$store.dispatch(`cluster/findAll`, { type: POD });
      }

      await Promise.all(promises);
    },

    /**
     * Nodes columns need other resources in order to show data in some columns
     *
     * In the paginated world we want to restrict the fetch of those resources to only the one's we need
     *
     * So when we have a page.... use those entries as filters when fetching the other resources
     *
     * of type PagTableFetchPageSecondaryResources
     */
    async fetchPageSecondaryResources({ canPaginate, force, page }: PagTableFetchPageSecondaryResourcesOpts) {
      if (!page?.length) {
        return;
      }

      if (this.canViewMgmtNodes && this.canViewNormanNodes) {
        if (this.canViewNormanNodes) {
          // Ideally we only fetch the nodes we need....
          this.$store.dispatch(`rancher/findAll`, { type: NORMAN.NODE });
        }

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
        // Note - fetching pods for current page could be a LOT still (probably max of 3k - 300 pods per node x 100 nodes in a page)
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

      // Fetch metrics given the current page
      this.loadMetrics();
    },

    clearLabelFilter() {
      this.selectedLabelKey = null;
      this.labelValue = '';
    },

    async ensureAllNodesLoaded() {
      // When filter becomes active, ensure all nodes are loaded
      // This is necessary because pagination only loads current page
      if (this.canPaginate && this.hasActiveFilter) {
        try {
          await this.$store.dispatch('cluster/findAll', { 
            type: this.resource,
            opt: { force: true }
          });
        } catch (err) {
          console.error('[Node Filter] Failed to load all nodes:', err);
        }
      }
    }
  },

  watch: {
    // Watch for filter activation and load all nodes
    hasActiveFilter: {
      handler(newVal) {
        if (newVal) {
          this.ensureAllNodesLoaded();
        }
      },
      immediate: false
    }
  },
});
</script>

<template>
  <div>
    <Banner
      v-if="hasWindowsNodes"
      color="info"
      :label="t('cluster.custom.registrationCommand.windowsWarning')"
    />
    
    <!-- Custom Label Filter Section -->
    <div class="label-filter-section mb-20">
      <div class="filter-row">
        <LabeledSelect
          v-model="selectedLabelKey"
          :options="labelKeyOptions"
          :label="t('node.list.labelFilter.labelKey')"
          :placeholder="t('node.list.labelFilter.selectLabelKey')"
          class="label-key-select"
        />
        
        <input
          v-model="labelValue"
          type="text"
          :placeholder="t('node.list.labelFilter.labelValuePlaceholder')"
          :disabled="!selectedLabelKey"
          class="label-value-input"
        />
        
        <button
          v-if="selectedLabelKey || labelValue"
          class="btn role-secondary clear-filter-btn"
          @click="clearLabelFilter"
        >
          {{ t('node.list.labelFilter.clear') }}
        </button>
      </div>
      
      <div
        v-if="selectedLabelKey && labelValue"
        class="filter-info"
      >
        <i class="icon icon-info" />
        <span>
          {{ t('node.list.labelFilter.filteringBy', { 
            key: selectedLabelKey, 
            value: labelValue,
            count: filteredRows.length 
          }) }}
        </span>
      </div>
    </div>

    <PaginatedResourceTable
      v-if="!hasActiveFilter"
      v-bind="$attrs"
      :schema="schema"
      :headers="headers"
      :paginationHeaders="paginationHeaders"
      :sub-rows="true"
      :fetchSecondaryResources="fetchSecondaryResources"
      :fetchPageSecondaryResources="fetchPageSecondaryResources"
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

    <!-- Use ResourceTable for filtered results (client-side) -->
    <ResourceTable
      v-else
      v-bind="$attrs"
      :schema="schema"
      :rows="filteredRows"
      :headers="headers"
      :sub-rows="true"
      data-testid="cluster-node-list-filtered"
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
    </ResourceTable>
  </div>
</template>

<style lang='scss' scoped>
.label-filter-section {
  background: var(--box-bg);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  padding: 15px;
  margin-bottom: 20px;

  .filter-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;

    .label-key-select {
      flex: 1;
      min-width: 200px;
      max-width: 300px;
    }

    .label-value-input {
      flex: 1;
      min-width: 200px;
      max-width: 300px;
      height: 40px;
      padding: 0 10px;
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      background: var(--input-bg);
      color: var(--input-text);
      
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &:focus {
        outline: none;
        border-color: var(--primary);
      }
    }

    .clear-filter-btn {
      height: 40px;
      padding: 0 15px;
      white-space: nowrap;
    }
  }

  .filter-info {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--primary);
    font-size: 14px;

    .icon-info {
      font-size: 16px;
    }
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
