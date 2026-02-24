<template>
  <div class="proxy-page-wrapper">
    <div v-if="!namespace || !name" style="padding: 20px;">
      <Banner color="error">
        <p>Missing required parameters: namespace or name</p>
      </Banner>
    </div>
    
    <!-- Loading state -->
    <div v-else-if="loading" style="padding: 40px; text-align: center;">
      <i class="icon icon-spinner icon-spin" style="font-size: 48px;" />
      <p style="margin-top: 20px;">Loading resource...</p>
    </div>
    
    <!-- Error state -->
    <div v-else-if="error" style="padding: 20px;">
      <Banner color="error">
        <p>{{ error }}</p>
      </Banner>
    </div>
    
    <!-- ProxyModal with loaded resource -->
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
import { defineComponent } from 'vue';
import Banner from '@components/Banner/Banner.vue';
import ProxyModal from '../components/ProxyModal.vue';

export default defineComponent({
  name: 'ProxyPage',
  
  components: {
    Banner,
    ProxyModal,
  },
  
  data() {
    return {
      resource: null as any,
      loading: true,
      error: '',
    };
  },
  
  computed: {
    clusterId(): string {
      return (this.$route.params.cluster as string) || 'local';
    },
    
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
    if (!this.namespace || !this.name) {
      this.loading = false;
      return;
    }
    
    console.log('[ProxyPage] Fetching resource:', {
      type: this.resourceType,
      namespace: this.namespace,
      name: this.name,
    });
    
    try {
      const type = this.resourceType;
      const id = `${this.namespace}/${this.name}`;
      
      this.resource = await this.$store.dispatch('cluster/find', {
        type,
        id,
        opt: { force: true }
      });
      
      console.log('[ProxyPage] Resource loaded:', this.resource?.metadata?.name);
      this.loading = false;
    } catch (err: any) {
      console.error('[ProxyPage] Load failed:', err);
      this.error = err.message || 'Failed to load resource';
      this.loading = false;
    }
  },
  
  methods: {
    handleClose() {
      if (window.history.length > 1) {
        this.$router.back();
      } else {
        window.close();
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.proxy-page-wrapper {
  background-color: var(--body-bg);
  min-height: 100vh;
}
</style>
