<script lang="ts">
import { defineComponent } from 'vue';
import ResourceTable from '@shell/components/ResourceTable.vue';
import { fetchPodMetrics } from '../utils/metrics';
import type { ParsedMetrics } from '../types/pod-metrics';

export default defineComponent({
  name: 'PodListWithMetrics',
  components: { ResourceTable },

  props: {
    // Standard props passed by Rancher to list components
    resource: {
      type: String,
      required: true
    },
    schema: {
      type: Object,
      default: null
    }
  },

  data() {
    return {
      metricsMap: new Map<string, ParsedMetrics>(),
      metricsLoading: false,
      metricsError: null as string | null,
      refreshInterval: null as number | null,
      lastFetchTime: 0, // Track last fetch to prevent duplicate requests
      storeUnwatch: null as any // Vuex store unwatch function
    };
  },

  computed: {
    // Get current cluster ID from route
    clusterId(): string {
      const cluster = this.$route.params.cluster;
      return Array.isArray(cluster) ? cluster[0] : (cluster || 'local');
    },

    // Extended headers with CPU and RAM columns
    headers() {
      const baseHeaders = this.defaultHeaders || [];
      
      // Find position: Insert after Node column, before Age column
      const nodeIndex = baseHeaders.findIndex((h: any) => h.name === 'node');
      const ageIndex = baseHeaders.findIndex((h: any) => h.name === 'age');
      
      // Determine insert position
      // We want: ... Node | CPU | RAM | Age ...
      let insertIndex = baseHeaders.length;
      
      if (ageIndex >= 0) {
        // Insert before Age
        insertIndex = ageIndex;
      } else if (nodeIndex >= 0) {
        // Insert after Node if Age not found
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

    // Get default headers from ResourceTable
    defaultHeaders(): any[] {
      return this.$store.getters['type-map/headersFor'](this.schema) || [];
    }
  },

  mounted() {
    // Initial metrics fetch
    this.loadMetrics();
    
    // Listen to Pod resource changes via Vuex store
    // This aligns with Rancher's WebSocket-based updates
    this.setupStoreWatch();
    
    // Fallback polling for metrics-only updates (10s)
    // Since metrics.k8s.io doesn't support WebSocket watch
    this.startPolling(10000);
    
    // Listen to tab visibility changes for adaptive polling
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  },

  beforeUnmount() {
    this.stopPolling();
    this.stopStoreWatch();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  },

  methods: {
    /**
     * Get metrics for a specific pod
     */
    getMetricsForPod(pod: any): ParsedMetrics {
      const key = `${pod.metadata?.namespace}/${pod.metadata?.name}`;
      const metrics = this.metricsMap.get(key);
      
      return metrics || { 
        cpu: 0, 
        memory: 0, 
        cpuDisplay: '0.00 vCPU', 
        memoryDisplay: '0 MiB' 
      };
    },

    /**
     * Start polling with specified interval
     */
    startPolling(interval: number = 10000) {
      this.stopPolling();
      this.refreshInterval = window.setInterval(() => {
        this.loadMetrics();
      }, interval);
    },

    /**
     * Stop polling
     */
    stopPolling() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
    },

    /**
     * Setup Vuex store watch to detect Pod changes
     * This aligns with Rancher's WebSocket-based resource updates
     */
    setupStoreWatch() {
      // Watch for Pod resource changes in the store
      // When Pods are updated via WebSocket, refresh metrics
      this.storeUnwatch = this.$store.watch(
        (state: any, getters: any) => {
          // Watch the pods collection revision
          const pods = getters['cluster/all']('pod');
          return pods?.length || 0;
        },
        (newVal: number, oldVal: number) => {
          // Only refresh if pod count changed (new pod added/removed)
          if (newVal !== oldVal) {
            this.loadMetrics();
          }
        }
      );
    },

    /**
     * Stop store watch
     */
    stopStoreWatch() {
      if (this.storeUnwatch) {
        this.storeUnwatch();
        this.storeUnwatch = null;
      }
    },

    /**
     * Handle tab visibility change for adaptive polling
     */
    handleVisibilityChange() {
      if (document.hidden) {
        // Tab inactive → slow down to 60s to save resources
        this.startPolling(60000);
      } else {
        // Tab active → back to 10s
        // Don't refresh immediately to avoid duplicate with ongoing interval
        this.startPolling(10000);
      }
    },

    /**
     * Load metrics from metrics.k8s.io API
     * Includes deduplication to prevent multiple simultaneous requests
     */
    async loadMetrics() {
      // Prevent duplicate requests within 2 seconds
      const now = Date.now();
      if (this.metricsLoading || (now - this.lastFetchTime < 2000)) {
        return;
      }
      
      try {
        this.metricsLoading = true;
        this.metricsError = null;
        this.lastFetchTime = now;
        
        const metrics = await fetchPodMetrics(
          this.$store.$axios,
          this.clusterId
        );
        
        this.metricsMap = metrics;
      } catch (error: any) {
        console.error('[PodMetrics] Error loading metrics:', error);
        this.metricsError = error.message || 'Failed to load metrics';
      } finally {
        this.metricsLoading = false;
      }
    }
  }
});
</script>

<template>
  <ResourceTable
    :schema="schema"
    :headers="headers"
    key-field="id"
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
</template>

<style lang="scss" scoped>
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
