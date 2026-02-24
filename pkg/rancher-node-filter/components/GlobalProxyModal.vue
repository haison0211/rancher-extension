<template>
  <div v-if="visible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <div class="modal-header">
        <h4>
          <i class="icon icon-globe" /> HTTP Proxy - {{ resourceName }}
        </h4>
        <button class="btn-close" @click="handleClose">
          <i class="icon icon-close" />
        </button>
      </div>
      
      <div class="modal-body">
        <ProxyModal
          v-if="resource"
          :resource="resource"
          :resource-type="resourceType"
          :cluster-id="clusterId"
          @close="handleClose"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapState } from 'vuex';
import ProxyModal from '../components/ProxyModal.vue';

export default defineComponent({
  name: 'GlobalProxyModal',
  
  components: {
    ProxyModal,
  },
  
  computed: {
    ...mapState('proxyModal', ['visible', 'resource', 'resourceType']),
    
    clusterId(): string {
      return this.$store?.getters['currentCluster']?.id || 'local';
    },
    
    resourceName(): string {
      return this.resource?.metadata?.name || 'Unknown';
    },
  },
  
  methods: {
    handleClose() {
      this.$store.dispatch('proxyModal/close');
    },
  },
});
</script>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-container {
  background-color: var(--body-bg);
  border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 20px;
  border-bottom: 1px solid var(--border);
  background-color: var(--header-bg);
}

.modal-header h4 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 500;
}

.btn-close {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.btn-close:hover {
  opacity: 1;
}

.btn-close i {
  font-size: 18px;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
</style>
