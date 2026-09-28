<script>
/**
 * CPU / RAM cell for the native Pod list (added with plugin.addTableColumn in index.ts).
 *
 * Each cell subscribes to the metrics of its own namespace, so only namespaces that are on screen
 * are fetched. Values come from metrics.k8s.io (same source as `kubectl top pods`).
 */
import {
  podUsage, podNamespaceLoaded, isPodNamespaceForbidden, podMetricsState, subscribePodMetrics
} from '../services/metrics-store';
import { formatVcpu, formatMemory, formatMib } from '../utils/quantity';
import { isPodTerminated } from '../utils/pod-state';

export default {
  name: 'NodeFilterPodMetric',

  props: {
    value: {
      type:    [String, Number, Object],
      default: null
    },
    row: {
      type:     Object,
      required: true
    },
    col: {
      type:    Object,
      default: () => ({})
    }
  },

  data() {
    return { release: null };
  },

  computed: {
    kind() {
      return this.col?.formatterOpts?.kind === 'memory' ? 'memory' : 'cpu';
    },

    namespace() {
      return this.row?.metadata?.namespace;
    },

    usage() {
      return this.namespace ? podUsage(this.namespace, this.row?.metadata?.name) : undefined;
    },

    /** Completed / Failed: no container is running, so real usage is exactly 0 */
    terminated() {
      return isPodTerminated(this.row);
    },

    zeroDisplay() {
      return this.kind === 'memory' ? formatMemory(0) : formatVcpu(0);
    },

    forbidden() {
      return !!this.namespace && isPodNamespaceForbidden(this.namespace);
    },

    /** Waiting for the first response for this namespace */
    pending() {
      return !!this.namespace && !podNamespaceLoaded(this.namespace) && !this.forbidden && !podMetricsState.error;
    },

    display() {
      if (!this.usage) {
        return '';
      }

      return this.kind === 'memory' ? formatMemory(this.usage.memory) : formatVcpu(this.usage.cpu);
    },

    missingReason() {
      if (this.forbidden) {
        return 'No permission to read metrics.k8s.io in this namespace';
      }
      if (podMetricsState.error) {
        return `Metrics unavailable: ${ podMetricsState.error }`;
      }

      return 'No sample yet: metrics-server samples a pod after its containers start (up to one resolution period, usually 15-60s)';
    },

    title() {
      const at = podMetricsState.fetchedAt ? new Date(podMetricsState.fetchedAt).toLocaleTimeString() : '-';

      // Exact value as printed by `kubectl top` (MiB) for cross-checking
      const exact = this.kind === 'memory' && this.usage ? `${ formatMib(this.usage.memory) } · ` : '';

      return `${ exact }metrics-server, fetched at ${ at }`;
    },
  },

  mounted() {
    if (this.namespace) {
      this.release = subscribePodMetrics(this.$store, this.$store.getters['clusterId'], [this.namespace]);
    }
  },

  beforeUnmount() {
    this.release?.();
    this.release = null;
  },
};
</script>

<template>
  <span
    v-if="usage"
    class="node-filter-metric"
    :title="title"
  >{{ display }}</span>
  <span
    v-else-if="terminated"
    class="text-muted node-filter-metric"
    :title="`Pod ${ row.status.phase }: no running container, usage is 0`"
  >{{ zeroDisplay }}</span>
  <i
    v-else-if="pending"
    class="icon icon-spinner icon-spin text-muted"
  />
  <span
    v-else
    class="text-muted"
    :title="missingReason"
  >&mdash;</span>
</template>

<style lang="scss" scoped>
/* Same-width digits so values line up and magnitudes can be compared at a glance */
.node-filter-metric {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
