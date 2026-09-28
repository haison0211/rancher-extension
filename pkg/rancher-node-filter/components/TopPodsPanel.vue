<script>
/**
 * "Top pods by CPU / RAM" panel shown above the native Pod list (plugin.addPanel in index.ts).
 *
 * The native list is paginated server-side and cannot sort by live usage, so this panel answers
 * "which pods are heavy" straight from metrics.k8s.io, without loading every pod object.
 * Collapsed by default; it makes no request while collapsed.
 */
import {
  subscribePodMetrics, listPodUsage, podMetricsState, refreshPodMetrics
} from '../services/metrics-store';
import { formatVcpu, formatMemory, formatMib } from '../utils/quantity';

const EXPANDED_KEY = 'rancher-node-filter.top-pods-expanded';
const LIMIT = 20;

function readExpanded() {
  try {
    return window.localStorage.getItem(EXPANDED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeExpanded(value) {
  try {
    window.localStorage.setItem(EXPANDED_KEY, `${ value }`);
  } catch {}
}

export default {
  name: 'NodeFilterTopPodsPanel',

  props: {
    // Passed by Rancher's ExtensionPanel, unused
    resource: {
      type:    Object,
      default: () => ({})
    }
  },

  data() {
    return {
      limit:      LIMIT,
      expanded:   readExpanded(),
      sortBy:     'cpu',
      release:    null,
      refreshing: false,
      now:        Date.now(),
      ticker:     null,
    };
  },

  computed: {
    clusterId() {
      return this.$store.getters['clusterId'];
    },

    /** Namespaces allowed by the header namespace filter (ns -> true) */
    activeNamespaces() {
      return this.$store.getters['activeNamespaceCache'] || {};
    },

    scope() {
      return this.$store.getters['isAllNamespaces'] ? '*' : Object.keys(this.activeNamespaces).sort();
    },

    scopeKey() {
      return this.scope === '*' ? '*' : this.scope.join(',');
    },

    rows() {
      const allowed = this.activeNamespaces;
      const filterByNamespace = Object.keys(allowed).length > 0;
      const key = this.sortBy;

      return listPodUsage((ns) => !filterByNamespace || !!allowed[ns])
        .sort((a, b) => b[key] - a[key])
        .slice(0, LIMIT);
    },

    updatedAgo() {
      if (!podMetricsState.fetchedAt) {
        return '';
      }

      return `${ Math.max(0, Math.round((this.now - podMetricsState.fetchedAt) / 1000)) }s ago`;
    },

    error() {
      return podMetricsState.error;
    },

    product() {
      return this.$route?.params?.product || 'explorer';
    },
  },

  watch: {
    expanded(value) {
      writeExpanded(value);
      this.resubscribe();
    },

    scopeKey() {
      this.resubscribe();
    },
  },

  mounted() {
    this.resubscribe();
  },

  beforeUnmount() {
    this.unsubscribe();
  },

  methods: {
    resubscribe() {
      this.unsubscribe();
      if (!this.expanded) {
        return;
      }
      this.release = subscribePodMetrics(this.$store, this.clusterId, this.scope);
      this.ticker = setInterval(() => {
        this.now = Date.now();
      }, 5000);
    },

    unsubscribe() {
      this.release?.();
      this.release = null;
      if (this.ticker) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    },

    async refresh() {
      this.refreshing = true;
      try {
        await refreshPodMetrics();
      } finally {
        this.refreshing = false;
        this.now = Date.now();
      }
    },

    podLocation(row) {
      return {
        name:   'c-cluster-product-resource-namespace-id',
        params: {
          cluster:   this.clusterId,
          product:   this.product,
          resource:  'pod',
          namespace: row.namespace,
          id:        row.name,
        }
      };
    },

    cpu(row) {
      return formatVcpu(row.cpu);
    },

    memory(row) {
      return formatMemory(row.memory);
    },

    /** Exact `kubectl top` value (MiB) in the tooltip */
    memoryHint(row) {
      return formatMib(row.memory);
    },
  },
};
</script>

<template>
  <div class="top-pods mb-20">
    <div class="top-pods__header">
      <button
        class="btn btn-sm role-link top-pods__toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <i :class="['icon', expanded ? 'icon-chevron-down' : 'icon-chevron-right']" />
        Top {{ limit }} pods by live usage
      </button>
      <template v-if="expanded">
        <div class="top-pods__sort">
          <button
            :class="['btn', 'btn-sm', sortBy === 'cpu' ? 'role-primary' : 'role-secondary']"
            @click="sortBy = 'cpu'"
          >
            CPU
          </button>
          <button
            :class="['btn', 'btn-sm', 'ml-5', sortBy === 'memory' ? 'role-primary' : 'role-secondary']"
            @click="sortBy = 'memory'"
          >
            RAM
          </button>
        </div>
        <span class="text-muted top-pods__meta">
          <template v-if="updatedAgo">metrics-server · updated {{ updatedAgo }}</template>
          <button
            class="btn btn-sm role-link"
            :disabled="refreshing"
            title="Refresh now"
            @click="refresh"
          >
            <i :class="['icon', 'icon-refresh', { 'icon-spin': refreshing }]" />
          </button>
        </span>
      </template>
    </div>

    <div
      v-if="expanded"
      class="top-pods__body"
    >
      <p
        v-if="error"
        class="text-error"
      >
        Metrics unavailable: {{ error }}
      </p>
      <p
        v-else-if="!rows.length && !updatedAgo"
        class="text-muted"
      >
        <i class="icon icon-spinner icon-spin" /> Loading metrics...
      </p>
      <p
        v-else-if="!rows.length"
        class="text-muted"
      >
        No pod metrics in the selected namespaces.
      </p>
      <table
        v-else
        class="top-pods__table"
      >
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Pod</th>
            <th class="num">
              CPU
            </th>
            <th class="num">
              RAM
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="`${ row.namespace }/${ row.name }`"
          >
            <td>{{ row.namespace }}</td>
            <td>
              <router-link :to="podLocation(row)">
                {{ row.name }}
              </router-link>
            </td>
            <td :class="['num', { strong: sortBy === 'cpu' }]">
              {{ cpu(row) }}
            </td>
            <td
              :class="['num', { strong: sortBy === 'memory' }]"
              :title="memoryHint(row)"
            >
              {{ memory(row) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.top-pods {
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  padding: 8px 12px;

  &__header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  &__toggle {
    padding-left: 0;
    font-weight: 600;
  }

  &__meta {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__body {
    margin-top: 8px;
    max-height: 420px;
    overflow-y: auto;
  }

  &__table {
    width: 100%;
    border-collapse: collapse;

    th, td {
      padding: 4px 8px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      color: var(--muted);
      font-weight: normal;
    }

    .num {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .strong {
      font-weight: 600;
    }
  }
}
</style>
