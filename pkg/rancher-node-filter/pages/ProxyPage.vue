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
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'vuex';
import ProxyModal from '../components/ProxyModal.vue';
import Banner from '@components/Banner/Banner.vue';

export default defineComponent({
  name: 'ProxyPage',
  
  components: {
    ProxyModal,
    Banner,
  },
  
  setup() {
    const route = useRoute();
    const router = useRouter();
    const store = useStore();
    
    const resource = ref<any>(null);
    const resourceLoading = ref(true);
    const loadError = ref<string>('');
    
    // Get params from query string
    const clusterId = computed(() => route.query.cluster as string || route.params.cluster as string);
    const namespace = computed(() => route.query.namespace as string);
    const name = computed(() => route.query.name as string);
    const resourceType = computed(() => route.query.type as string || 'pod');
    
    /**
     * Load resource from Rancher store
     */
    onMounted(async () => {
      try {
        const type = resourceType.value;
        const id = `${namespace.value}/${name.value}`;
        
        // Fetch resource from cluster store
        resource.value = await store.dispatch('cluster/find', {
          type,
          id,
          opt: { force: true }
        });
        
        resourceLoading.value = false;
      } catch (err: any) {
        console.error('[ProxyPage] Failed to load resource:', err);
        loadError.value = err.message || 'Unknown error';
        resourceLoading.value = false;
      }
    });
    
    /**
     * Handle close - go back or close tab
     */
    const handleClose = () => {
      // Try to go back in history
      if (window.history.length > 1) {
        router.back();
      } else {
        // Close tab if opened via window.open()
        window.close();
      }
    };
    
    return {
      resource,
      resourceLoading,
      loadError,
      clusterId,
      resourceType,
      handleClose,
    };
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
