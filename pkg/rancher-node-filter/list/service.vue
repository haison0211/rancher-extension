<script lang="ts">
import { defineComponent } from 'vue';
import ResourceTable from '@shell/components/ResourceTable.vue';
import ProxyModal from '../components/ProxyModal.vue';

export default defineComponent({
  name: 'ServiceListWithProxy',
  
  components: { 
    ResourceTable,
    ProxyModal,
  },

  props: {
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
      // Proxy modal state
      showProxyModal: false,
      proxyResource: null as any,
      proxyResourceType: 'service' as 'pod' | 'service',
    };
  },

  computed: {
    clusterId(): string {
      const cluster = this.$route.params.cluster;
      return Array.isArray(cluster) ? cluster[0] : (cluster || 'local');
    },

    headers(): any[] {
      // Use default headers from Rancher
      return this.$store.getters['type-map/headersFor'](this.schema) || [];
    },
  },

  mounted() {
    // Listen for proxy modal open events from Service actions
    window.addEventListener('proxy-modal:open', this.handleProxyModalEvent);
  },

  beforeUnmount() {
    window.removeEventListener('proxy-modal:open', this.handleProxyModalEvent);
  },

  methods: {
    /**
     * Handle proxy modal open event from Service action
     */
    handleProxyModalEvent(event: Event) {
      const customEvent = event as CustomEvent;
      const payload = customEvent.detail;
      
      // Only handle service events
      if (payload.resourceType !== 'service') {
        return;
      }
      
      this.proxyResource = payload.resource;
      this.proxyResourceType = payload.resourceType;
      this.showProxyModal = true;
    },

    /**
     * Close proxy modal
     */
    closeProxyModal() {
      this.showProxyModal = false;
      this.proxyResource = null;
    },
  },
});
</script>

<template>
  <div class="service-list-wrapper">
    <ResourceTable
      v-bind="$attrs"
      :schema="schema"
      :headers="headers"
      key-field="id"
    />
    
    <!-- Inline HTTP Proxy Modal Overlay -->
    <div v-if="showProxyModal" class="proxy-modal-overlay" @click.self="closeProxyModal">
      <div class="proxy-modal-container">
        <!-- ProxyModal component - contains all UI including close button -->
        <ProxyModal
          v-if="proxyResource"
          :resource="proxyResource"
          :resource-type="proxyResourceType"
          :cluster-id="clusterId"
          @close="closeProxyModal"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* Wrapper để tránh multiple root nodes */
.service-list-wrapper {
  width: 100%;
  height: 100%;
}

/* Inline Proxy Modal Overlay */
.proxy-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(2px);
}

.proxy-modal-container {
  background-color: var(--body-bg);
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  width: 95%;
  max-width: 1200px;
  max-height: 90vh;
  overflow-y: auto;
  animation: modal-slide-in 0.2s ease-out;
  position: relative;
  padding: 24px;
}

@keyframes modal-slide-in {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
