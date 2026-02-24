<template>
  <div class="proxy-page">
    <!-- Loading State -->
    <div v-if="resourceLoading" class="loading-container">
      <i class="icon icon-spinner icon-spin" />
      <p>Loading resource...</p>
    </div>
    
    <!-- Error State -->
    <Banner v-else-if="loadError" color="error" class="mt-20">
      <p>Failed to load resource: {{ loadError }}</p>
    </Banner>
    
    <!-- Proxy Modal Content -->
    <ProxyModal
      v-else-if="resource"
      :resource="resource"
      :resource-type="resourceType"
      :cluster-id="clusterId"
      @close="handleClose"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue';
import ProxyModal from '../components/ProxyModal.vue';
import Banner from '@components/Banner/Banner.vue';

export default defineComponent({
  name: 'ProxyPage',
  
  components: {
    ProxyModal,
    Banner,
  },
  
  data() {
    return {
      resource: null as any,
      resourceLoading: true,
      loadError: '',
    };
  },
  
  computed: {
    // Get cluster from route params (from /c/:cluster path)
    clusterId(): string {
      return (this.$route.params.cluster as string) || 'local';
    },
    
    // Get namespace, name, type from query string
    namespace(): string {
      return this.$route.query.namespace as string;
    },
    
    name(): string {
      return this.$route.query.name as string;
    },
    
    resourceType(): string {
      return (this.$route.query.type as string) || 'pod';
    },
  },
  
  async mounted() {
    console.log('[ProxyPage] Component mounted!', {
      cluster: this.clusterId,
      namespace: this.namespace,
      name: this.name,
      type: this.resourceType,
    });
    await this.loadResource();
  },
  
  methods: {
    /**
     * Load resource from Rancher store
     */
    async loadResource() {
      try {
        const type = this.resourceType;
        const id = `${this.namespace}/${this.name}`;
        
        // Fetch resource from cluster store
        this.resource = await this.$store.dispatch('cluster/find', {
          type,
          id,
          opt: { force: true }
        });
        
        this.resourceLoading = false;
      } catch (err: any) {
        console.error('[ProxyPage] Failed to load resource:', err);
        this.loadError = err.message || 'Unknown error';
        this.resourceLoading = false;
      }
    },
    
    /**
     * Handle close - go back or close tab
     */
    handleClose() {
      // Try to go back in history
      if (window.history.length > 1) {
        this.$router.back();
      } else {
        // Close tab if opened via window.open()
        window.close();
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.proxy-page {
  height: 100vh;
  overflow: auto;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  
  i {
    font-size: 48px;
    margin-bottom: 20px;
  }
  
  p {
    font-size: 18px;
    color: var(--input-label);
  }
}
</style>
