/**
 * Node Shell Detail Page
 * 
 * Handles routing when ?mode=shell is present
 * Displays NodeShell component for interactive shell session
 */

<script lang="ts">
import { defineComponent } from 'vue';
import NodeShell from '../components/NodeShell.vue';
import Loading from '@shell/components/Loading.vue';
import { NODE } from '@shell/config/types';

export default defineComponent({
  name: 'NodeShellDetail',
  
  components: {
    NodeShell,
    Loading
  },
  
  props: {
    value: {
      type: Object,
      required: true
    },
    
    mode: {
      type: String,
      default: 'view'
    }
  },
  
  data() {
    return {
      loading: true
    };
  },
  
  async mounted() {
    await this.loadNode();
  },
  
  methods: {
    async loadNode() {
      const nodeId = this.value?.id || this.$route.params.id;
      
      if (nodeId) {
        try {
          await this.$store.dispatch('cluster/find', {
            type: NODE,
            id: nodeId,
            opt: { force: true }
          });
        } catch (error) {
          console.error('[NodeShellDetail] Failed to load node:', error);
        }
      }
      
      this.loading = false;
    }
  },
  
  computed: {
    node() {
      const nodeId = this.value?.id || this.$route.params.id;
      return this.$store.getters['cluster/byId'](NODE, nodeId);
    },
    
    tabId(): string {
      return `node-shell-${this.node?.metadata?.name || 'unknown'}`;
    },
    
    isShellMode(): boolean {
      return this.mode === 'shell' || this.$route.query.mode === 'shell';
    }
  }
});
</script>

<template>
  <Loading v-if="loading" />
  <div
    v-else-if="!node"
    class="node-shell-error"
  >
    <h2>Node Not Found</h2>
    <p>The requested node could not be found.</p>
    <button
      class="btn role-primary"
      @click="$router.push({ name: 'c-cluster-product-resource', params: { resource: 'node' } })"
    >
      Back to Node List
    </button>
  </div>
  
  <!-- Show shell interface when mode=shell -->
  <NodeShell
    v-else-if="isShellMode"
    :node="node"
    :tab-id="tabId"
  />
  
  <!-- Fallback to default detail view (will show empty or Rancher's default) -->
  <div
    v-else
    class="node-detail-fallback"
  >
    <p class="text-muted">
      Default node detail view. Shell mode is available via action menu.
    </p>
  </div>
</template>

<style lang="scss" scoped>
.node-shell-error {
  text-align: center;
  padding: 60px 20px;
  
  h2 {
    margin-bottom: 16px;
    color: var(--error);
  }
  
  p {
    margin-bottom: 24px;
    color: var(--muted);
  }
}

.node-detail-fallback {
  padding: 40px 20px;
  text-align: center;
  
  .text-muted {
    font-size: 14px;
  }
}
</style>
