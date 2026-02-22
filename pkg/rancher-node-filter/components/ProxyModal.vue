<script lang="ts">
/**
 * HTTP Proxy Modal Component
 * 
 * Provides UI for testing HTTP endpoints on Pods and Services
 * via Rancher's Kubernetes API proxy mechanism.
 * 
 * Compatible with Rancher 2.13.1
 */

import { defineComponent, ref, computed, watch, PropType } from 'vue';
import { useProxyRequest, validateProxyOptions, ProxyRequestOptions } from '../composables/useProxyRequest';
import LabeledSelect from '@shell/components/form/LabeledSelect.vue';
import Banner from '@components/Banner/Banner.vue';

interface Container {
  name: string;
  ports?: Array<{ containerPort: number; protocol?: string; name?: string }>;
}

interface Port {
  port: number;
  targetPort?: number | string;
  protocol?: string;
  name?: string;
}

export default defineComponent({
  name: 'ProxyModal',
  
  components: {
    LabeledSelect,
    Banner,
  },
  
  props: {
    resource: {
      type: Object as PropType<any>,
      required: true,
    },
    
    resourceType: {
      type: String as PropType<'pod' | 'service'>,
      required: true,
      validator: (value: string) => ['pod', 'service'].includes(value),
    },
    
    clusterId: {
      type: String,
      required: true,
    },
  },
  
  emits: ['close'],
  
  setup(props, { emit }) {
    const { loading, error, response, execute, reset } = useProxyRequest();
    
    // Form state
    const selectedContainer = ref<string>('');
    const selectedPort = ref<string>(''); // Changed to string for v-model compatibility
    const customPort = ref<string | number>(''); // Can be string or number from input type="number"
    const httpPath = ref<string>('/');
    
    // Response display state
    const showResponse = ref<boolean>(false);
    const responseTab = ref<'raw' | 'formatted'>('formatted');
    const copyUrlSuccess = ref<boolean>(false);
    
    /**
     * Get namespace from resource
     */
    const namespace = computed(() => {
      return props.resource?.metadata?.namespace || 'default';
    });
    
    /**
     * Get resource name
     */
    const resourceName = computed(() => {
      return props.resource?.metadata?.name || 'unknown';
    });
    
    /**
     * Detect containers for Pods
     */
    const containers = computed<Container[]>(() => {
      if (props.resourceType !== 'pod') return [];
      
      const spec = props.resource?.spec;
      if (!spec) return [];
      
      return (spec.containers || []).map((c: any) => ({
        name: c.name,
        ports: c.ports || [],
      }));
    });
    
    /**
     * Container options for dropdown
     */
    const containerOptions = computed(() => {
      return containers.value.map(c => ({
        label: c.name,
        value: c.name,
      }));
    });
    
    /**
     * Get selected container object
     */
    const selectedContainerObj = computed(() => {
      return containers.value.find(c => c.name === selectedContainer.value);
    });
    
    /**
     * Detect ports for Services
     */
    const servicePorts = computed<Port[]>(() => {
      if (props.resourceType !== 'service') return [];
      
      const spec = props.resource?.spec;
      if (!spec) return [];
      
      return spec.ports || [];
    });
    
    /**
     * Combined port options based on resource type
     */
    const portOptions = computed(() => {
      if (props.resourceType === 'pod') {
        // Get ports from selected container
        const containerPorts = selectedContainerObj.value?.ports || [];
        return containerPorts.map(p => {
          const portStr = String(p.containerPort);
          return p.name ? `${portStr} (${p.name})` : portStr;
        });
      } else {
        // Get ports from service
        return servicePorts.value.map(p => {
          const portStr = String(p.port);
          return p.name ? `${portStr} (${p.name})` : portStr;
        });
      }
    });
    
    /**
     * Check if service is ExternalName type
     */
    const isExternalNameService = computed(() => {
      if (props.resourceType !== 'service') return false;
      return props.resource?.spec?.type === 'ExternalName';
    });
    
    /**
     * Check if service has no endpoints warning
     */
    const serviceWarning = computed(() => {
      if (props.resourceType !== 'service') return null;
      
      const spec = props.resource?.spec;
      if (!spec) return null;
      
      // Check if service has selector
      const hasSelector = spec.selector && Object.keys(spec.selector).length > 0;
      
      if (!hasSelector) {
        return 'This service has no selector. It may not have any endpoints.';
      }
      
      return null;
    });
    
    /**
     * Final port to use (selected or custom)
     */
    const finalPort = computed(() => {
      // Custom port takes priority (can be string or number from input type="number")
      if (customPort.value) {
        const parsed = typeof customPort.value === 'string' 
          ? parseInt(customPort.value.trim(), 10)
          : customPort.value;
        return isNaN(parsed) ? null : parsed;
      }
      // Parse selectedPort to number (format: "80" or "80 (http)")
      if (selectedPort.value) {
        // Extract number from string like "80 (http)" -> "80"
        const portStr = selectedPort.value.split(' ')[0];
        const parsed = parseInt(portStr, 10);
        return isNaN(parsed) ? null : parsed;
      }
      return null;
    });
    
    /**
     * Validation message
     */
    const validationError = computed(() => {
      if (isExternalNameService.value) {
        return 'Cannot proxy ExternalName services';
      }
      
      if (props.resourceType === 'pod' && containers.value.length > 0 && !selectedContainer.value) {
        return 'Please select a container';
      }
      
      if (!finalPort.value) {
        return 'Please select or enter a valid port';
      }
      
      if (!httpPath.value || !httpPath.value.trim()) {
        return 'HTTP path cannot be empty';
      }
      
      const options: Partial<ProxyRequestOptions> = {
        clusterId: props.clusterId,
        namespace: namespace.value,
        resourceType: props.resourceType,
        resourceName: resourceName.value,
        port: finalPort.value,
      };
      
      return validateProxyOptions(options);
    });
    
    /**
     * Can execute proxy request
     */
    const canExecute = computed(() => {
      return !validationError.value && !loading.value;
    });
    
    /**
     * Preview proxy information
     */
    const proxyPreview = computed(() => {
      if (!finalPort.value) {
        return null;
      }
      
      const path = httpPath.value.trim() || '/';
      const resourceName = props.resource?.metadata?.name || 'unknown';
      const container = selectedContainer.value ? ` (container: ${selectedContainer.value})` : '';
      
      return {
        resource: `${props.resourceType === 'pod' ? 'Pod' : 'Service'}: ${resourceName}${container}`,
        port: finalPort.value,
        path,
      };
    });
    
    /**
     * Execute proxy request
     */
    async function executeProxy() {
      if (!canExecute.value || !finalPort.value) {
        return;
      }
      
      reset();
      showResponse.value = false;
      
      try {
        // Get axios from window (Rancher context)
        const axios = (window as any).$nuxt?.$store?.$axios;
        if (!axios) {
          throw {
            code: 'AXIOS_NOT_FOUND',
            message: 'Axios instance not found',
            details: 'Cannot access Rancher HTTP client. Please refresh the page.',
          };
        }
        
        const options: ProxyRequestOptions = {
          clusterId: props.clusterId,
          namespace: namespace.value,
          resourceType: props.resourceType,
          resourceName: resourceName.value,
          port: finalPort.value,
          path: httpPath.value.trim(),
          method: 'GET',  // Always use GET method
          timeout: 10000,
          maxResponseSize: 1024 * 1024, // 1MB
        };
        
        await execute(axios, options);
        showResponse.value = true;
        
      } catch (err) {
        // Error is already set in useProxyRequest
        showResponse.value = true;
      }
    }
    
    /**
     * Copy proxy URL to clipboard
     */
    async function copyProxyUrl() {
      try {
        // Handle customPort which can be string or number
        let finalPort: number | null = null;
        if (customPort.value) {
          const parsed = typeof customPort.value === 'string' 
            ? parseInt(customPort.value.trim(), 10)
            : customPort.value;
          finalPort = isNaN(parsed) ? null : parsed;
        } else if (selectedPort.value) {
          // Extract number from string like "80 (http)" -> "80"
          const portStr = selectedPort.value.split(' ')[0];
          const parsed = parseInt(portStr, 10);
          finalPort = isNaN(parsed) ? null : parsed;
        }
        
        if (!finalPort) {
          return;
        }
        
        // Build proxy URL with full domain
        const path = httpPath.value.trim() || '/';
        const resourceName = props.resource?.metadata?.name || 'unknown';
        const resourcePath = props.resourceType === 'pod' ? 'pods' : 'services';
        
        // Get full URL with domain
        const origin = window.location.origin; // e.g., https://rancher.selless.com
        const proxyPath = `/k8s/clusters/${props.clusterId}/api/v1/namespaces/${namespace.value}/${resourcePath}/${resourceName}:${finalPort}/proxy${path}`;
        const fullUrl = `${origin}${proxyPath}`;
        
        // Copy to clipboard
        await navigator.clipboard.writeText(fullUrl);
        
        // Show success feedback
        copyUrlSuccess.value = true;
        setTimeout(() => {
          copyUrlSuccess.value = false;
        }, 2000);
        
      } catch (err) {
        console.error('[ProxyModal] Failed to copy URL:', err);
      }
    }
    
    /**
     * Close modal
     */
    function close() {
      emit('close');
    }
    
    /**
     * Format JSON response
     */
    const formattedResponse = computed(() => {
      if (!response.value) return '';
      
      try {
        const parsed = JSON.parse(response.value.data);
        return JSON.stringify(parsed, null, 2);
      } catch {
        // Not JSON, return as-is
        return response.value.data;
      }
    });
    
    /**
     * Response status class
     */
    const responseStatusClass = computed(() => {
      if (!response.value) return '';
      
      const status = response.value.status;
      if (status >= 200 && status < 300) return 'text-success';
      if (status >= 400 && status < 500) return 'text-warning';
      if (status >= 500) return 'text-error';
      return '';
    });
    
    // Auto-select first container/port if only one option
    watch(() => containerOptions.value, (options) => {
      if (options.length === 1 && !selectedContainer.value) {
        selectedContainer.value = options[0].value;
      }
    }, { immediate: true });
    
    watch(() => portOptions.value, (options) => {
      if (options.length === 1 && !selectedPort.value) {
        selectedPort.value = options[0]; // portOptions is now array of strings
      }
    }, { immediate: true });
    
    // Reset selected port when container changes (for pods)
    watch(() => selectedContainer.value, () => {
      if (props.resourceType === 'pod') {
        selectedPort.value = '';
      }
    });
    
    // Clear selected port when custom port is entered
    watch(() => customPort.value, (newVal) => {
      if (newVal) {
        selectedPort.value = '';
      }
    });
    
    // Clear custom port when port is selected from dropdown
    watch(() => selectedPort.value, (newVal) => {
      if (newVal) {
        customPort.value = '';
      }
    });
    
    return {
      // State
      selectedContainer,
      selectedPort,
      customPort,
      httpPath,
      showResponse,
      responseTab,
      copyUrlSuccess,
      loading,
      error,
      response,
      
      // Computed
      namespace,
      resourceName,
      containers,
      containerOptions,
      portOptions,
      isExternalNameService,
      serviceWarning,
      finalPort,
      validationError,
      canExecute,
      proxyPreview,
      formattedResponse,
      responseStatusClass,
      
      // Methods
      executeProxy,
      copyProxyUrl,
      close,
    };
  },
});
</script>

<template>
  <div class="proxy-modal">
    <div class="modal-header">
      <h3>{{ resourceType === 'pod' ? 'Pod' : 'Service' }} HTTP Proxy</h3>
      <button
        class="btn btn-sm role-link"
        @click="close"
      >
        <i class="icon icon-close" />
      </button>
    </div>
    
    <div class="modal-body">
      <!-- Resource Info -->
      <div class="resource-info mb-20">
        <div class="info-row">
          <span class="label">Namespace:</span>
          <span class="value">{{ namespace }}</span>
        </div>
        <div class="info-row">
          <span class="label">{{ resourceType === 'pod' ? 'Pod' : 'Service' }}:</span>
          <span class="value">{{ resourceName }}</span>
        </div>
      </div>
      
      <!-- Warnings/Errors -->
      <Banner
        v-if="isExternalNameService"
        color="error"
        class="mb-20"
      >
        Cannot proxy ExternalName services. This service type does not have a cluster IP or endpoints.
      </Banner>
      
      <Banner
        v-else-if="serviceWarning"
        color="warning"
        class="mb-20"
      >
        {{ serviceWarning }}
      </Banner>
      
      <!-- Container Selection (Pods only) -->
      <LabeledSelect
        v-if="resourceType === 'pod' && containerOptions.length > 1"
        v-model="selectedContainer"
        :options="containerOptions"
        label="Container"
        placeholder="Select a container"
        class="mb-15"
        :disabled="loading"
      />
      
      <!-- Port Selection -->
      <div v-if="portOptions.length > 0" class="mb-15">
        <label class="text-label">Port</label>
        <select
          v-model="selectedPort"
          class="form-control"
          :disabled="loading"
        >
          <option value="" disabled>Select a port</option>
          <option
            v-for="port in portOptions"
            :key="port"
            :value="port"
          >
            {{ port }}
          </option>
        </select>
      </div>
      
      <!-- Custom Port Override -->
      <div class="mb-15">
        <label class="text-label">Custom Port (optional)</label>
        <input
          v-model="customPort"
          type="number"
          placeholder="Override with custom port number"
          class="form-control"
          :disabled="loading"
        />
      </div>
      
      <!-- HTTP Path -->
      <div class="mb-15">
        <label class="text-label">HTTP Path</label>
        <input
          v-model="httpPath"
          type="text"
          placeholder="/"
          class="form-control"
          :disabled="loading"
        />
      </div>
      
      <!-- Validation Error -->
      <Banner
        v-if="validationError"
        color="error"
        class="mb-20"
      >
        {{ validationError }}
      </Banner>
      
      <!-- Proxy Preview -->
      <div v-if="proxyPreview" class="proxy-preview mb-20">
        <div class="preview-title">
          <i class="icon icon-info" />
          <span>Proxy Request Preview</span>
        </div>
        <div class="preview-content">
          <div class="preview-item">
            <span class="preview-label">Target:</span>
            <span class="preview-value">{{ proxyPreview.resource }}</span>
          </div>
          <div class="preview-item">
            <span class="preview-label">Port:</span>
            <span class="preview-value">{{ proxyPreview.port }}</span>
          </div>
          <div class="preview-item">
            <span class="preview-label">Path:</span>
            <span class="preview-value">{{ proxyPreview.path }}</span>
          </div>
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="actions mb-20">
        <button
          class="btn role-primary"
          :disabled="!canExecute || loading"
          @click="executeProxy"
        >
          <i v-if="loading" class="icon icon-spinner icon-spin" />
          {{ loading ? 'Executing...' : 'Execute Proxy Request' }}
        </button>
        
        <button
          class="btn role-secondary ml-10"
          :disabled="!canExecute"
          @click="copyProxyUrl"
        >
          <i v-if="copyUrlSuccess" class="icon icon-checkmark" />
          <i v-else class="icon icon-copy" />
          {{ copyUrlSuccess ? 'Copied!' : 'Copy URL' }}
        </button>
        
        <button
          class="btn role-secondary ml-10"
          :disabled="loading"
          @click="close"
        >
          Cancel
        </button>
      </div>
      
      <!-- Response Section -->
      <div
        v-if="showResponse"
        class="response-section"
      >
        <h4 class="mb-10">
          Response
        </h4>
        
        <!-- Error Display -->
        <Banner
          v-if="error"
          color="error"
          class="mb-15"
        >
          <div class="error-content">
            <div class="error-title">
              <strong>{{ error.code }}:</strong> {{ error.message }}
            </div>
            <div
              v-if="error.details"
              class="error-details mt-10"
            >
              {{ error.details }}
            </div>
          </div>
        </Banner>
        
        <!-- Success Response -->
        <div
          v-else-if="response"
          class="response-content"
        >
          <div class="response-header mb-10">
            <span :class="responseStatusClass">
              <strong>Status:</strong> {{ response.status }} {{ response.statusText }}
            </span>
            <span class="ml-20">
              <strong>Content-Type:</strong> {{ response.contentType }}
            </span>
            <span class="ml-20">
              <strong>Size:</strong> {{ (response.size / 1024).toFixed(2) }} KB
            </span>
          </div>
          
          <Banner
            v-if="response.truncated"
            color="warning"
            class="mb-10"
          >
            Response was truncated (exceeded 1MB limit). Showing first 1MB only.
          </Banner>
          
          <!-- Tab Navigation -->
          <div class="tabs mb-10">
            <button
              :class="['tab', { active: responseTab === 'formatted' }]"
              @click="responseTab = 'formatted'"
            >
              Formatted
            </button>
            <button
              :class="['tab', { active: responseTab === 'raw' }]"
              @click="responseTab = 'raw'"
            >
              Raw
            </button>
          </div>
          
          <!-- Response Body -->
          <pre
            class="response-body"
          ><code>{{ responseTab === 'formatted' ? formattedResponse : response.data }}</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.proxy-modal {
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--body-bg);
  border-radius: var(--border-radius);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border);
  
  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.resource-info {
  background: var(--box-bg);
  padding: 15px;
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  
  .info-row {
    display: flex;
    margin-bottom: 8px;
    
    &:last-child {
      margin-bottom: 0;
    }
    
    .label {
      font-weight: 600;
      min-width: 100px;
      color: var(--muted);
    }
    
    .value {
      color: var(--body-text);
      font-family: monospace;
    }
  }
}

.proxy-preview {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  padding: 12px 15px;
  
  .preview-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--primary);
    margin-bottom: 10px;
    
    i {
      font-size: 14px;
    }
  }
  
  .preview-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .preview-item {
    display: flex;
    align-items: baseline;
    font-size: 13px;
    gap: 8px;
    
    .preview-label {
      font-weight: 600;
      color: var(--muted);
      min-width: 50px;
    }
    
    .preview-value {
      color: var(--body-text);
      font-family: monospace;
      flex: 1;
      word-break: break-all;
    }
  }
}

.actions {
  display: flex;
  align-items: center;
}

.response-section {
  border-top: 1px solid var(--border);
  padding-top: 20px;
  margin-top: 20px;
  
  h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
}

.response-header {
  font-size: 13px;
  color: var(--muted);
}

.text-success {
  color: var(--success);
}

.text-warning {
  color: var(--warning);
}

.text-error {
  color: var(--error);
}

.error-content {
  .error-title {
    font-size: 14px;
  }
  
  .error-details {
    font-size: 13px;
    color: var(--muted);
    font-style: italic;
  }
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  
  .tab {
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 13px;
    color: var(--muted);
    
    &:hover {
      color: var(--body-text);
    }
    
    &.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
    }
  }
}

.response-body {
  background: var(--code-bg);
  padding: 15px;
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  max-height: 400px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.5;
  
  code {
    color: var(--body-text);
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
  }
}
</style>
