<template>
  <div class="prometheus-settings">
    <button 
      class="btn btn-sm role-tertiary" 
      @click="toggleForm"
    >
      <i class="icon icon-gear" /> {{ t('nodeFilter.prometheusSettings.button') }}
    </button>
    
    <!-- Inline form (shown when expanded) -->
    <div
      v-if="showForm"
      class="settings-form"
    >
      <div class="settings-form-content">
        <div class="form-header">
          <h5>{{ t('nodeFilter.prometheusSettings.title') }}</h5>
          <button class="btn btn-sm role-link" @click="closeForm">
            <i class="icon icon-close" />
          </button>
        </div>
        
        <div class="form-body">
          <div class="mb-15">
            <label class="text-label">
              {{ t('nodeFilter.prometheusSettings.endpointLabel') }}
              <span class="text-muted">{{ t('nodeFilter.prometheusSettings.endpointHint') }}</span>
            </label>
            <input
              v-model="endpoint"
              type="text"
              class="form-control"
              :placeholder="defaultEndpoint"
              @input="validateInput"
            />
            <p v-if="validationError" class="text-error mt-5">
              <i class="icon icon-warning" /> {{ validationError }}
            </p>
            <p v-else class="text-muted mt-5">
              {{ t('nodeFilter.prometheusSettings.defaultValue') }}: <code>{{ defaultEndpoint }}</code>
            </p>
          </div>
          
          <div class="info-box">
            <h6>{{ t('nodeFilter.prometheusSettings.examplesTitle') }}</h6>
            <ul>
              <li><code>ops/services/ops-prometheus-server:80</code></li>
              <li><code>monitoring/services/prometheus-k8s:9090</code></li>
              <li><code>cattle-monitoring-system/services/rancher-monitoring-prometheus:9090</code></li>
            </ul>
          </div>
        </div>
        
        <div class="form-actions">
          <button 
            class="btn role-secondary btn-sm" 
            @click="reset"
          >
            <i class="icon icon-refresh" /> {{ t('nodeFilter.prometheusSettings.reset') }}
          </button>
          <button 
            class="btn role-primary btn-sm" 
            :disabled="!!validationError"
            @click="save"
          >
            <i class="icon icon-checkmark" /> {{ t('nodeFilter.prometheusSettings.save') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { 
  getPrometheusEndpoint, 
  setPrometheusEndpoint, 
  resetPrometheusEndpoint,
  getDefaultEndpoint,
  validateEndpoint
} from '../utils/prometheus-config.js';

export default {
  name: 'PrometheusSettings',
  
  data() {
    return {
      showForm: false,
      endpoint: '',
      defaultEndpoint: getDefaultEndpoint(),
      validationError: null
    };
  },
  
  methods: {
    toggleForm() {
      this.showForm = !this.showForm;
      if (this.showForm) {
        this.endpoint = getPrometheusEndpoint();
        this.validationError = null;
      }
    },
    
    closeForm() {
      this.showForm = false;
      this.validationError = null;
    },
    
    validateInput() {
      const trimmed = this.endpoint.trim();
      
      if (!trimmed) {
        this.validationError = this.t('nodeFilter.prometheusSettings.errorEmpty');
        return false;
      }
      
      if (!validateEndpoint(trimmed)) {
        this.validationError = this.t('nodeFilter.prometheusSettings.errorInvalid');
        return false;
      }
      
      this.validationError = null;
      return true;
    },
    
    save() {
      if (!this.validateInput()) {
        return;
      }
      
      const success = setPrometheusEndpoint(this.endpoint.trim());
      if (success) {
        this.$emit('saved');
        this.closeForm();
        
        // Show success notification
        this.$store.dispatch('growl/success', {
          title: this.t('nodeFilter.prometheusSettings.saveSuccess'),
          message: this.t('nodeFilter.prometheusSettings.saveSuccessMessage')
        }, { root: true });
      } else {
        this.validationError = this.t('nodeFilter.prometheusSettings.errorSave');
      }
    },
    
    reset() {
      resetPrometheusEndpoint();
      this.endpoint = this.defaultEndpoint;
      this.validationError = null;
      
      this.$store.dispatch('growl/info', {
        title: this.t('nodeFilter.prometheusSettings.resetSuccess'),
        message: this.t('nodeFilter.prometheusSettings.resetSuccessMessage', { endpoint: this.defaultEndpoint })
      }, { root: true });
    }
  }
};
</script>

<style lang="scss" scoped>
.prometheus-settings {
  position: relative;
  display: inline-block;
  
  .btn {
    i {
      margin-right: 5px;
    }
  }
  
  // Inline form dropdown
  .settings-form {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 10px;
    z-index: 1000;
    min-width: 500px;
    background: var(--box-bg);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    
    .settings-form-content {
      padding: 20px;
    }
    
    .form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
      
      h5 {
        margin: 0;
        font-size: 1.1em;
        font-weight: 600;
      }
      
      .btn {
        padding: 0;
        
        i {
          margin: 0;
        }
      }
    }
    
    .form-body {
      margin-bottom: 15px;
      
      .text-label {
        display: block;
        font-weight: 600;
        margin-bottom: 8px;
        
        .text-muted {
          font-weight: normal;
          font-size: 0.9em;
          margin-left: 5px;
        }
      }
      
      .form-control {
        width: 100%;
        font-family: monospace;
        font-size: 0.95em;
      }
      
      .text-error {
        color: var(--error);
        font-size: 0.9em;
        
        i {
          margin-right: 4px;
        }
      }
      
      .text-muted {
        color: var(--muted);
        font-size: 0.9em;
        
        code {
          background: var(--body-bg);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.95em;
        }
      }
      
      .info-box {
        background: var(--info-banner-bg, #e8f4fd);
        border-left: 4px solid var(--info, #0088cc);
        padding: 12px;
        margin-top: 15px;
        border-radius: 4px;
        
        h6 {
          margin-top: 0;
          margin-bottom: 8px;
          font-size: 0.9em;
          font-weight: 600;
        }
        
        ul {
          margin: 0;
          padding-left: 20px;
          
          li {
            margin-bottom: 4px;
            font-size: 0.85em;
            
            code {
              background: var(--body-bg);
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 0.95em;
            }
          }
        }
      }
    }
    
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-top: 15px;
      border-top: 1px solid var(--border);
    }
  }
}
</style>
