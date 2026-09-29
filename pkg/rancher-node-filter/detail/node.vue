<script>
/**
 * Node detail: verbatim copy of Rancher's shell/detail/node.vue (Rancher 2.13.1; 2.14.3 only drops one spacer,
 * 2.15.2 only adds the "Running" label on the Pods gauge, reproduced below where Rancher has that string) plus
 * - Display fix on Rancher's CPU / RAM gauges (see FEATURES.md "Native display fixes"): live usage / allocatable
 *   from metrics.k8s.io, the same numbers as the node list and `kubectl top nodes`
 * - CPU / RAM columns in the Pods tab (metrics.k8s.io, sortable by the real numbers)
 * - Shell button (hidden when Rancher 2.15+ turns node or pod shell off)
 * - Pods are dropped from the store when leaving the page (like Rancher's node list does), so they
 *   can never show up in another page's pod list (e.g. a Deployment)
 *
 * The pods themselves are fetched exactly like Rancher does, so the Pods tab and gauge stay live.
 */
import ConsumptionGauge from '@shell/components/ConsumptionGauge';
import Alert from '@shell/components/Alert';
import ResourceTable from '@shell/components/ResourceTable';
import Tab from '@shell/components/Tabbed/Tab';
import {
  EFFECT,
  IMAGE_SIZE,
  KEY,
  SIMPLE_NAME,
  VALUE
} from '@shell/config/table-headers';
import ResourceTabs from '@shell/components/form/ResourceTabs';
import { POD } from '@shell/config/types';
import createEditView from '@shell/mixins/create-edit-view';
import { formatSi, exponentNeeded, UNITS } from '@shell/utils/units';
import DashboardMetrics from '@shell/components/DashboardMetrics';
import { mapGetters } from 'vuex';
import { allDashboardsExist } from '@shell/utils/grafana';
import Loading from '@shell/components/Loading';
import { FilterArgs, PaginationParamFilter } from '@shell/types/store/pagination.types';

import {
  subscribeNodeMetrics, subscribePodMetrics, nodeUsage, nodeMetricsState, podUsage, podMetricsState
} from '../services/metrics-store';
import { parseQuantity, toMillicores } from '../utils/quantity';
import { defineSortKey, sortGenerationWith } from '../utils/sort-keys';
import { isNodeReady, isShellFeatureEnabled } from '../utils/node-state';
import { isPodTerminated } from '../utils/pod-state';

const NODE_METRICS_DETAIL_URL = '/api/v1/namespaces/cattle-monitoring-system/services/http:rancher-monitoring-grafana:80/proxy/d/rancher-node-detail-1/rancher-node-detail?orgId=1';
const NODE_METRICS_SUMMARY_URL = '/api/v1/namespaces/cattle-monitoring-system/services/http:rancher-monitoring-grafana:80/proxy/d/rancher-node-1/rancher-node?orgId=1';

const SORT_KEY_POD_CPU = 'nodeFilterCpu';
const SORT_KEY_POD_MEMORY = 'nodeFilterMemory';

/** Same number the cell shows: live usage, 0 for Completed / Failed pods, -1 (sorts last) when unknown */
function podSortValue(pod, kind) {
  const usage = podUsage(pod.metadata?.namespace, pod.metadata?.name);

  if (usage) {
    return usage[kind];
  }

  return isPodTerminated(pod) ? 0 : -1;
}

function podMetricHeader(kind) {
  return {
    name:          `node-filter-${ kind }`,
    label:         kind === 'cpu' ? 'CPU' : 'RAM',
    value:         'metadata.name',
    formatter:     'NodeFilterPodMetric',
    formatterOpts: { kind },
    sort:          [kind === 'cpu' ? SORT_KEY_POD_CPU : SORT_KEY_POD_MEMORY],
    search:        false,
    width:         110,
    align:         'right',
  };
}

export default {
  name: 'DetailNode',

  emits: ['input'],

  components: {
    Alert,
    ConsumptionGauge,
    DashboardMetrics,
    Loading,
    ResourceTabs,
    Tab,
    ResourceTable,
  },

  mixins: [createEditView],

  props: {
    value: {
      type:     Object,
      required: true,
    },
  },

  async fetch() {
    if (this.podSchema) {
      this.filterByApi = this.$store.getters[`cluster/paginationEnabled`](POD);

      if (this.filterByApi) {
        // Only get pods associated with this node. The actual values used are from a get all in node model `pods` getter (this works as it just gets all...)
        const opt = { // Of type ActionFindPageArgs
          pagination: new FilterArgs({
            sort:    [{ field: 'metadata.name', asc: true }],
            filters: PaginationParamFilter.createSingleField({
              field: 'spec.nodeName',
              value: this.value.id,
            })
          })
        };

        this.$store.dispatch(`cluster/findPage`, { type: POD, opt });
      } else {
        this.$store.dispatch('cluster/findAll', { type: POD });
      }
    }

    this.showMetrics = await allDashboardsExist(this.$store, this.currentCluster.id, [NODE_METRICS_DETAIL_URL, NODE_METRICS_SUMMARY_URL]);
  },

  data() {
    const podSchema = this.$store.getters['cluster/schemaFor'](POD);
    const podTableHeaders = [...(this.$store.getters['type-map/headersFor'](podSchema) || [])];
    const ageIndex = podTableHeaders.findIndex((h) => h.name === 'age');

    // CPU / RAM before Age
    podTableHeaders.splice(ageIndex >= 0 ? ageIndex : podTableHeaders.length, 0, podMetricHeader('cpu'), podMetricHeader('memory'));

    return {
      metrics:          { cpu: 0, memory: 0 },
      infoTableHeaders: [
        {
          ...KEY,
          label: '',
          width: 200
        },
        {
          ...VALUE,
          label:       '',
          dashIfEmpty: true,
        }
      ],
      imageTableHeaders: [
        { ...SIMPLE_NAME, width: null },
        { ...IMAGE_SIZE, width: 100 } // Ensure one header has a size, all other columns will scale
      ],
      taintTableHeaders: [
        KEY,
        VALUE,
        EFFECT
      ],
      podSchema,
      podTableHeaders,
      NODE_METRICS_DETAIL_URL,
      NODE_METRICS_SUMMARY_URL,
      showMetrics:     false,
      filterByApi:     undefined,

      releaseNodeMetrics: null,
      releasePodMetrics:  null,
      // Adds numeric sort keys to the pod rows and re-sorts when pods or pod metrics change
      podSortGenerationFn: sortGenerationWith(
        () => this.decoratePodsForSort(),
        () => this.$store.getters['cluster/currentGeneration']?.(POD) || 0,
        () => podMetricsState.fetchedAt
      ),
    };
  },

  mounted() {
    this.releaseNodeMetrics = subscribeNodeMetrics(this.$store, this.$store.getters['clusterId']);
  },

  beforeUnmount() {
    this.releaseNodeMetrics?.();
    this.releasePodMetrics?.();
    this.releaseNodeMetrics = null;
    this.releasePodMetrics = null;

    // Rancher's node list does the same when it is left. Without it the pods loaded here stay in the store
    // and a Deployment detail page opened later (without SQL cache) can list them as its own pods.
    if (this.podSchema) {
      this.$store.dispatch('cluster/forgetType', POD);
    }
  },

  computed: {
    ...mapGetters(['currentCluster']),
    memoryUnits() {
      const exponent = exponentNeeded(this.value.ramReserved, 1024);

      return `${ UNITS[exponent] }iB`;
    },

    pidPressureStatus() {
      return this.mapToStatus(this.value.isPidPressureOk);
    },

    diskPressureStatus() {
      return this.mapToStatus(this.value.isDiskPressureOk);
    },

    memoryPressureStatus() {
      return this.mapToStatus(this.value.isMemoryPressureOk);
    },

    kubeletStatus() {
      return this.mapToStatus(this.value.isKubeletOk);
    },

    infoTableRows() {
      return Object.keys(this.value.status.nodeInfo)
        .map((key) => ({
          key:   this.t(`node.detail.tab.info.key.${ key }`),
          value: this.value.status.nodeInfo[key]
        }));
    },

    imageTableRows() {
      const images = this.value.status.images || [];

      return images.map((image) => ({
        // image.names[1] typically has the user friendly name but on occasion there's only one name and we should use that
        name:      image.names ? (image.names[1] || image.names[0]) : '---',
        sizeBytes: image.sizeBytes
      }));
    },

    taintTableRows() {
      return this.value.spec.taints || [];
    },

    graphVars() {
      return { instance: `${ this.value.internalIp }:9796` };
    },

    // ---- live node usage (display fix) ----------------------------------------

    liveUsage() {
      return nodeUsage(this.value.id);
    },

    /** Same unit as Rancher's gauge (cores): allocatable */
    cpuAllocatableCores() {
      return toMillicores(this.value.status?.allocatable?.cpu) / 1000;
    },

    /** Rounded up to the millicore like `kubectl top`, so it matches the pod columns to 0.001 vCPU */
    cpuUsedCores() {
      return this.liveUsage ? Math.ceil(this.liveUsage.cpu - 1e-6) / 1000 : 0;
    },

    /** Same unit as Rancher's gauge (bytes): allocatable */
    memoryAllocatableBytes() {
      return parseQuantity(this.value.status?.allocatable?.memory);
    },

    memoryUsedBytes() {
      return this.liveUsage ? this.liveUsage.memory : 0;
    },

    metricsError() {
      return nodeMetricsState.error;
    },

    // ---- pods tab ----------------------------------------------------------------

    podNamespaces() {
      return [...new Set((this.value.pods || []).map((pod) => pod.metadata?.namespace).filter(Boolean))].sort();
    },

    shellFeatureEnabled() {
      return isShellFeatureEnabled(this.$store.getters);
    },

    canShell() {
      return isNodeReady(this.value);
    },

    /** Rancher 2.15+ labels the Pods gauge "Running"; older Rancher has no such string and keeps "Used" */
    podsUsedLabel() {
      const key = 'node.detail.glance.consumptionGauge.running';

      return this.$store.getters['i18n/exists'](key) ? this.t(key) : null;
    },
  },

  watch: {
    // Keep metrics for every namespace that has a pod on this node (needed to sort all rows, not only visible ones)
    podNamespaces: {
      handler(neu, old) {
        if (old && neu.join(',') === old.join(',')) {
          return;
        }
        const previous = this.releasePodMetrics;

        this.releasePodMetrics = neu.length ? subscribePodMetrics(this.$store, this.$store.getters['clusterId'], neu) : null;
        previous?.();
      },
      immediate: true,
    },
  },

  methods: {
    memoryFormatter(value) {
      const formatOptions = {
        addSuffix: false,
        increment: 1024,
      };

      return formatSi(value, formatOptions);
    },

    /** Gauge numbers in vCPU with 3 decimals (0.001 vCPU = 1 millicore), same unit as the pod columns */
    vcpuFormatter(value) {
      return (value || 0).toFixed(3);
    },

    mapToStatus(isOk) {
      return isOk ? 'success' : 'error';
    },

    decoratePodsForSort() {
      (this.value.pods || []).forEach((pod) => {
        defineSortKey(pod, SORT_KEY_POD_CPU, (p) => podSortValue(p, 'cpu'));
        defineSortKey(pod, SORT_KEY_POD_MEMORY, (p) => podSortValue(p, 'memory'));
      });
    },

    openShell() {
      import(/* webpackChunkName: "node-shell" */ '../utils/node-shell').then(({ openNodeShell }) => openNodeShell(this.value));
    },
  }
};
</script>

<template>
  <Loading v-if="$fetchState.pending" />
  <div
    v-else
    class="node"
  >
    <div class="spacer" />
    <div class="alerts">
      <Alert
        class="mr-10"
        :status="pidPressureStatus"
        :message="t('node.detail.glance.pidPressure')"
      />
      <Alert
        class="mr-10"
        :status="diskPressureStatus"
        :message="t('node.detail.glance.diskPressure')"
      />
      <Alert
        class="mr-10"
        :status="memoryPressureStatus"
        :message="t('node.detail.glance.memoryPressure')"
      />
      <Alert
        :status="kubeletStatus"
        :message="t('node.detail.glance.kubelet')"
      />
    </div>
    <div
      v-if="shellFeatureEnabled"
      class="node-filter-actions"
    >
      <button
        class="btn btn-sm role-secondary"
        :disabled="!canShell"
        :title="canShell ? 'Open a root shell on this node' : 'Node is not Ready'"
        @click="openShell"
      >
        <i class="icon icon-terminal" /> Shell
      </button>
    </div>
    <div class="mt-20 resources">
      <ConsumptionGauge
        v-if="liveUsage"
        :resource-name="t('node.detail.glance.consumptionGauge.cpu')"
        :capacity="cpuAllocatableCores"
        :used="cpuUsedCores"
        units="vCPU"
        :number-formatter="vcpuFormatter"
      />
      <div
        v-else
        class="gauge-pending"
      >
        <h3>{{ t('node.detail.glance.consumptionGauge.cpu') }}</h3>
        <span
          v-if="metricsError"
          class="text-error"
        >metrics-server: {{ metricsError }}</span>
        <i
          v-else
          class="icon icon-spinner icon-spin"
        />
      </div>
      <ConsumptionGauge
        v-if="liveUsage"
        :resource-name="t('node.detail.glance.consumptionGauge.memory')"
        :capacity="memoryAllocatableBytes"
        :used="memoryUsedBytes"
        :units="memoryUnits"
        :number-formatter="memoryFormatter"
      />
      <div
        v-else
        class="gauge-pending"
      >
        <h3>{{ t('node.detail.glance.consumptionGauge.memory') }}</h3>
        <span
          v-if="metricsError"
          class="text-error"
        >metrics-server: {{ metricsError }}</span>
        <i
          v-else
          class="icon icon-spinner icon-spin"
        />
      </div>
      <ConsumptionGauge
        :resource-name="t('node.detail.glance.consumptionGauge.pods')"
        :capacity="value.podCapacity"
        :used="value.podConsumed"
      >
        <!-- The bundled gauge predates its `usedLabel` prop: same markup as its default title, other label -->
        <template
          v-if="podsUsedLabel"
          #title="{ amountTemplateValues, formattedPercentage }"
        >
          <span>{{ podsUsedLabel }}</span>
          <span class="numbers-stats">
            {{ t('node.detail.glance.consumptionGauge.amount', amountTemplateValues) }}
            <span class="percentage"><i>/&nbsp;</i>{{ formattedPercentage }}</span>
          </span>
        </template>
      </ConsumptionGauge>
    </div>
    <div class="spacer" />
    <ResourceTabs
      :value="value"
      :mode="mode"
      @update:value="$emit('input', $event)"
    >
      <Tab
        v-if="podSchema"
        name="pods"
        :label="t('node.detail.tab.pods')"
        :weight="4"
      >
        <ResourceTable
          key-field="_key"
          :headers="podTableHeaders"
          :rows="value.pods"
          :row-actions="false"
          :table-actions="false"
          :search="false"
          :sort-generation-fn="podSortGenerationFn"
        />
      </Tab>
      <Tab
        v-if="showMetrics"
        :label="t('node.detail.tab.metrics')"
        name="node-metrics"
        :weight="3"
      >
        <template #default="props">
          <DashboardMetrics
            v-if="props.active"
            :detail-url="NODE_METRICS_DETAIL_URL"
            :summary-url="NODE_METRICS_SUMMARY_URL"
            :vars="graphVars"
            graph-height="875px"
          />
        </template>
      </Tab>
      <Tab
        name="info"
        :label="t('node.detail.tab.info.label')"
        class="bordered-table"
        :weight="2"
      >
        <ResourceTable
          key-field="_key"
          :headers="infoTableHeaders"
          :rows="infoTableRows"
          :row-actions="false"
          :table-actions="false"
          :show-headers="false"
          :search="false"
        />
      </Tab>
      <Tab
        name="images"
        :label="t('node.detail.tab.images')"
        :weight="1"
      >
        <ResourceTable
          key-field="_key"
          :headers="imageTableHeaders"
          :rows="imageTableRows"
          :row-actions="false"
          :table-actions="false"
        />
      </Tab>
      <Tab
        name="taints"
        :label="t('node.detail.tab.taints')"
        :weight="0"
      >
        <ResourceTable
          key-field="_key"
          :headers="taintTableHeaders"
          :rows="taintTableRows"
          :row-actions="false"
          :table-actions="false"
          :search="false"
        />
      </Tab>
    </ResourceTabs>
  </div>
</template>

<style lang="scss" scoped>
.resources {
  display: flex;
  flex-direction: row;
  justify-content: space-between;

  & > * {
    width: 30%;
  }
}

.node-filter-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.gauge-pending {
  h3 {
    margin-bottom: 10px;
  }
}
</style>
