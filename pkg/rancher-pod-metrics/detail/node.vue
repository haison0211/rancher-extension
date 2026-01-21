<script>
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
import { METRIC, POD } from '@shell/config/types';
import createEditView from '@shell/mixins/create-edit-view';
import { formatSi, exponentNeeded, UNITS } from '@shell/utils/units';
import DashboardMetrics from '@shell/components/DashboardMetrics';
import { mapGetters } from 'vuex';
import { allDashboardsExist } from '@shell/utils/grafana';
import Loading from '@shell/components/Loading';
import metricPoller from '@shell/mixins/metric-poller';
import { FilterArgs, PaginationParamFilter } from '@shell/types/store/pagination.types';

const NODE_METRICS_DETAIL_URL = '/api/v1/namespaces/cattle-monitoring-system/services/http:rancher-monitoring-grafana:80/proxy/d/rancher-node-detail-1/rancher-node-detail?orgId=1';
const NODE_METRICS_SUMMARY_URL = '/api/v1/namespaces/cattle-monitoring-system/services/http:rancher-monitoring-grafana:80/proxy/d/rancher-node-1/rancher-node?orgId=1';

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

  mixins: [createEditView, metricPoller],

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
    
    // Load pod metrics
    await this.loadPodMetrics();
    
    // Start polling
    this.startMetricsPolling();
  },

  data() {
    const podSchema = this.$store.getters['cluster/schemaFor'](POD);

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
      podTableHeaders: [], // Will be computed with metrics headers
      NODE_METRICS_DETAIL_URL,
      NODE_METRICS_SUMMARY_URL,
      showMetrics:     false,
      filterByApi:     undefined,
      // Metrics state
      metricsMap: new Map(),
      metricsLoading: false,
      metricsError: null,
      refreshInterval: null,
      lastFetchTime: 0, // Track last fetch to prevent duplicate requests
    };
  },

  computed: {
    ...mapGetters(['currentCluster']),
    
    // Pod table headers with CPU/RAM metrics columns
    podTableHeadersWithMetrics() {
      if (!this.podSchema) return [];
      
      const baseHeaders = this.$store.getters['type-map/headersFor'](this.podSchema) || [];
      
      // Find position: after Node, before Age
      const nodeIndex = baseHeaders.findIndex(h => h.name === 'node');
      const ageIndex = baseHeaders.findIndex(h => h.name === 'age');
      
      let insertIndex = baseHeaders.length;
      if (ageIndex >= 0) {
        insertIndex = ageIndex;
      } else if (nodeIndex >= 0) {
        insertIndex = nodeIndex + 1;
      }
      
      const metricsHeaders = [
        {
          name: 'cpu',
          label: 'CPU',
          value: 'cpu',
          sort: ['cpu'],
          width: 120
        },
        {
          name: 'memory',
          label: 'RAM',
          value: 'memory',
          sort: ['memory'],
          width: 120
        }
      ];
      
      return [
        ...baseHeaders.slice(0, insertIndex),
        ...metricsHeaders,
        ...baseHeaders.slice(insertIndex)
      ];
    },
    
    clusterId() {
      return this.$route.params.cluster || 'local';
    },
    
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
    }
  },

  methods: {
    memoryFormatter(value) {
      const formatOptions = {
        addSuffix: false,
        increment: 1024,
      };

      return formatSi(value, formatOptions);
    },

    mapToStatus(isOk) {
      return isOk ? 'success' : 'error';
    },

    async loadMetrics() {
      const schema = this.$store.getters['cluster/schemaFor'](METRIC.NODE);

      if (schema) {
        await this.$store.dispatch('cluster/find', {
          type: METRIC.NODE,
          id:   this.value.id,
          opt:  { force: true }
        });

        this.$forceUpdate();
      }
    },
    
    // Pod metrics methods
    async loadPodMetrics() {
      // Prevent duplicate requests within 2 seconds
      const now = Date.now();
      if (this.metricsLoading || (now - this.lastFetchTime < 2000)) {
        return;
      }
      
      try {
        this.metricsLoading = true;
        this.metricsError = null;
        this.lastFetchTime = now;
        
        const { fetchPodMetrics } = await import('../utils/metrics');
        const metrics = await fetchPodMetrics(this.$store.$axios, this.clusterId);
        
        this.metricsMap = metrics;
      } catch (error) {
        console.error('[NodeDetail] Error loading pod metrics:', error);
        this.metricsError = error.message || 'Failed to load metrics';
      } finally {
        this.metricsLoading = false;
      }
    },
    
    startMetricsPolling() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
      
      this.refreshInterval = setInterval(() => {
        this.loadPodMetrics();
      }, 10000); // 10s interval
    },
    
    stopMetricsPolling() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
    },
    
    getMetricsForPod(pod) {
      const key = `${pod.metadata?.namespace}/${pod.metadata?.name}`;
      const metrics = this.metricsMap.get(key);
      
      return metrics || { 
        cpu: 0, 
        memory: 0, 
        cpuDisplay: '0.00 vCPU', 
        memoryDisplay: '0 MiB' 
      };
    }
  },
  
  beforeDestroy() {
    this.stopMetricsPolling();
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
    <div class="mt-20 resources">
      <ConsumptionGauge
        :resource-name="t('node.detail.glance.consumptionGauge.cpu')"
        :capacity="value.cpuCapacity"
        :used="value.cpuUsage"
      />
      <ConsumptionGauge
        :resource-name="t('node.detail.glance.consumptionGauge.memory')"
        :capacity="value.ramReserved"
        :used="value.ramUsage"
        :units="memoryUnits"
        :number-formatter="memoryFormatter"
      />
      <ConsumptionGauge
        :resource-name="t('node.detail.glance.consumptionGauge.pods')"
        :capacity="value.podCapacity"
        :used="value.podConsumed"
      />
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
          :headers="podTableHeadersWithMetrics"
          :rows="value.pods"
          :row-actions="false"
          :table-actions="false"
          :search="false"
        >
          <!-- Custom cell formatters for CPU -->
          <template #cell:cpu="{ row }">
            <span v-if="metricsLoading && metricsMap.size === 0" class="text-muted">
              <i class="icon icon-spinner icon-spin" />
            </span>
            <span v-else-if="metricsError" class="text-error" :title="metricsError">
              Error
            </span>
            <span v-else :title="`${getMetricsForPod(row).cpu} millicores`">
              {{ getMetricsForPod(row).cpuDisplay }}
            </span>
          </template>

          <!-- Custom cell formatters for RAM -->
          <template #cell:memory="{ row }">
            <span v-if="metricsLoading && metricsMap.size === 0" class="text-muted">
              <i class="icon icon-spinner icon-spin" />
            </span>
            <span v-else-if="metricsError" class="text-error" :title="metricsError">
              Error
            </span>
            <span v-else :title="`${getMetricsForPod(row).memory} MiB`">
              {{ getMetricsForPod(row).memoryDisplay }}
            </span>
          </template>
        </ResourceTable>
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

.text-muted {
  color: var(--muted);
}

.text-error {
  color: var(--error);
  cursor: help;
}

.icon-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
