<template>
  <div class="proxy-page-wrapper">
    <h1 style="color: #0075ff; font-size: 24px; margin-bottom: 20px;">
      🌐 HTTP Proxy
    </h1>
    
    <div v-if="!namespace || !name" style="padding: 20px;">
      <Banner color="error">
        <p>Missing required parameters: namespace or name</p>
      </Banner>
    </div>
    
    <ProxyModalSimplified
      v-else
      :namespace="namespace"
      :resource-name="name"
      :resource-type="resourceType"
      :cluster-id="clusterId"
      @close="handleClose"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import Banner from '@components/Banner/Banner.vue';

// Simple wrapper component that fetches resource internally
const ProxyModalSimplified = defineComponent({
  name: 'ProxyModalSimplified',
  
  props: {
    namespace: { type: String, required: true },
    resourceName: { type: String, required: true },
    resourceType: { type: String, default: 'pod' },
    clusterId: { type: String, default: 'local' },
  },
  
  data() {
    return {
      resource: null as any,
      loading: true,
      error: '',
    };
  },
  
  async mounted() {
    console.log('[ProxyModalSimplified] Fetching resource:', {
      type: this.resourceType,
      namespace: this.namespace,
      name: this.resourceName,
    });
    
    try {
      const type = this.resourceType;
      const id = `${this.namespace}/${this.resourceName}`;
      
      this.resource = await this.$store.dispatch('cluster/find', {
        type,
        id,
        opt: { force: true }
      });
      
      console.log('[ProxyModalSimplified] Resource loaded:', this.resource?.metadata?.name);
      this.loading = false;
    } catch (err: any) {
      console.error('[ProxyModalSimplified] Load failed:', err);
      this.error = err.message || 'Failed to load resource';
      this.loading = false;
    }
  },
  
  render(h: any) {
    if (this.loading) {
      return h('div', { style: 'padding: 40px; text-align: center;' }, [
        h('i', { class: 'icon icon-spinner icon-spin', style: 'font-size: 48px;' }),
        h('p', { style: 'margin-top: 20px;' }, 'Loading resource...'),
      ]);
    }
    
    if (this.error) {
      const Banner = this.$options.components?.Banner;
      return h('div', { style: 'padding: 20px;' }, [
        h(Banner, { props: { color: 'error' } }, [
          h('p', `Error: ${this.error}`),
        ]),
      ]);
    }
    
    if (this.resource) {
      const ProxyModal = require('../components/ProxyModal.vue').default;
      return h(ProxyModal, {
        props: {
          resource: this.resource,
          resourceType: this.resourceType,
          clusterId: this.clusterId,
        },
        on: {
          close: () => this.$emit('close'),
        },
      });
    }
    
    return h('div', 'No resource');
  },
});

export default defineComponent({
  name: 'ProxyPage',
  
  components: {
    Banner,
    ProxyModalSimplified,
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
  padding: 40px;
  background: white;
  min-height: 100vh;
}
</style>
