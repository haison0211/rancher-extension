/**
 * NodeShell Component
 * 
 * Shell window component for executing commands in node shell pod
 * Reuses Rancher's ContainerShell component for consistency
 */

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { NODE_SHELL_CONFIG } from '../types/node-shell';
import {
  createShellPod,
  waitForPodReady,
  deleteShellPod,
  checkPermissions
} from '../utils/node-shell';

export default defineComponent({
  name: 'NodeShell',
  
  props: {
    // The node resource to shell into
    node: {
      type: Object as PropType<any>,
      required: true
    },
    
    // Tab ID for window manager
    tabId: {
      type: String,
      required: true
    }
  },
  
  data() {
    return {
      shellPod: null as any,
      status: 'checking' as 'checking' | 'creating' | 'waiting' | 'connecting' | 'connected' | 'error' | 'closed',
      statusMessage: 'Checking permissions...',
      error: null as Error | null,
      
      // Cleanup on unmount
      shouldCleanup: true,
    };
  },
  
  computed: {
    nodeName(): string {
      return this.node?.metadata?.name || '';
    },
    
    namespace(): string {
      return NODE_SHELL_CONFIG.NAMESPACE;
    }
  },
  
  async mounted() {
    await this.initializeShell();
  },
  
  beforeUnmount() {
    this.cleanup();
  },
  
  methods: {
    async initializeShell() {
      try {
        // 1. Check permissions
        this.status = 'checking';
        this.statusMessage = 'Checking permissions...';
        
        const { canShell, missingPerms } = await checkPermissions(this.$store);
        if (!canShell) {
          throw new Error(`Missing permissions: ${missingPerms.join(', ')}`);
        }
        
        // 2. Create pod
        this.status = 'creating';
        this.statusMessage = `Creating shell pod for node ${this.nodeName}...`;
        
        this.shellPod = await createShellPod(this.$store, {
          nodeName: this.nodeName,
          namespace: this.namespace
        });
        
        // 3. Wait for pod to be ready
        this.status = 'waiting';
        this.statusMessage = 'Waiting for pod to be ready...';
        
        await waitForPodReady(
          this.$store,
          this.shellPod.metadata.namespace,
          this.shellPod.metadata.name
        );
        
        // 4. Open shell
        this.status = 'connecting';
        this.statusMessage = 'Connecting to shell...';
        
        await this.openShell();
        
        this.status = 'connected';
        this.statusMessage = '';
        
      } catch (error: any) {
        console.error('[NodeShell] Initialization failed:', error);
        this.status = 'error';
        this.error = error;
        this.statusMessage = error.message || 'Failed to initialize shell';
        
        // Clean up pod if creation failed
        if (this.shellPod) {
          await this.cleanupPod();
        }
      }
    },
    
    async openShell() {
      if (!this.shellPod) {
        throw new Error('No shell pod available');
      }
      
      // Use the pod's openShell method directly (matches Pod model behavior)
      if (typeof this.shellPod.openShell === 'function') {
        this.shellPod.openShell('shell');
      } else {
        // Fallback: manually dispatch to window manager
        const store = this.$store as any;
        store.dispatch('wm/open', {
          id: `${this.tabId}-terminal`,
          label: `Shell: ${this.nodeName}`,
          icon: 'terminal',
          component: 'ContainerShell',
          attrs: {
            pod: this.shellPod,
            initialContainer: 'shell'
          }
        });
      }
    },
    
    async cleanupPod() {
      if (!this.shellPod || !this.shouldCleanup) {
        return;
      }
      
      try {
        await deleteShellPod(
          this.$store,
          this.shellPod.metadata.namespace,
          this.shellPod.metadata.name
        );
        console.log('[NodeShell] Cleanup completed');
      } catch (error) {
        console.error('[NodeShell] Cleanup failed:', error);
      }
    },
    
    cleanup() {
      // Cleanup will be triggered by window close event
      // See: shell/components/Window/Window.vue beforeClose callback
    },
    
    retry() {
      this.error = null;
      this.status = 'checking';
      this.initializeShell();
    }
  }
});
</script>

<template>
  <div class="node-shell-container">
    <!-- Status Display -->
    <div
      v-if="status !== 'connected'"
      class="shell-status"
    >
      <!-- Loading State -->
      <div
        v-if="['checking', 'creating', 'waiting', 'connecting'].includes(status)"
        class="shell-loading"
      >
        <i class="icon icon-spinner icon-spin" />
        <h3>{{ statusMessage }}</h3>
        <div class="shell-steps">
          <div
            class="step"
            :class="{ active: status === 'checking', done: ['creating', 'waiting', 'connecting'].includes(status) }"
          >
            <i :class="status === 'checking' ? 'icon icon-spinner icon-spin' : 'icon icon-checkmark'" />
            <span>Checking permissions</span>
          </div>
          <div
            class="step"
            :class="{ active: status === 'creating', done: ['waiting', 'connecting'].includes(status) }"
          >
            <i :class="status === 'creating' ? 'icon icon-spinner icon-spin' : status === 'checking' ? 'icon icon-dot' : 'icon icon-checkmark'" />
            <span>Creating shell pod</span>
          </div>
          <div
            class="step"
            :class="{ active: status === 'waiting', done: status === 'connecting' }"
          >
            <i :class="status === 'waiting' ? 'icon icon-spinner icon-spin' : ['checking', 'creating'].includes(status) ? 'icon icon-dot' : 'icon icon-checkmark'" />
            <span>Waiting for pod ready</span>
          </div>
          <div
            class="step"
            :class="{ active: status === 'connecting' }"
          >
            <i :class="status === 'connecting' ? 'icon icon-spinner icon-spin' : 'icon icon-dot'" />
            <span>Connecting to shell</span>
          </div>
        </div>
      </div>
      
      <!-- Error State -->
      <div
        v-else-if="status === 'error'"
        class="shell-error"
      >
        <i class="icon icon-error text-error" />
        <h3 class="text-error">
          Failed to Shell into Node
        </h3>
        <p class="error-message">
          {{ statusMessage }}
        </p>
        <div class="error-details">
          <p><strong>Node:</strong> {{ nodeName }}</p>
          <p v-if="shellPod">
            <strong>Pod:</strong> {{ shellPod.metadata.name }}
          </p>
          <p v-if="error">
            <strong>Error:</strong> {{ error.message }}
          </p>
        </div>
        <div class="error-actions">
          <button
            class="btn role-secondary"
            @click="retry"
          >
            <i class="icon icon-refresh" />
            Retry
          </button>
          <button
            class="btn role-primary"
            @click="$router.go(-1)"
          >
            Back to Node List
          </button>
        </div>
      </div>
    </div>
    
    <!-- Terminal will be opened in window manager -->
    <div
      v-else
      class="shell-connected"
    >
      <p class="text-muted">
        <i class="icon icon-checkmark text-success" />
        Shell connected. Terminal window should open automatically.
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.node-shell-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 20px;
}

.shell-status {
  text-align: center;
  max-width: 600px;
}

.shell-loading {
  h3 {
    margin: 20px 0;
    color: var(--body-text);
  }
  
  > .icon-spinner {
    font-size: 48px;
    color: var(--primary);
  }
}

.shell-steps {
  margin-top: 40px;
  text-align: left;
  
  .step {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    margin: 8px 0;
    background: var(--nav-bg);
    border-radius: 4px;
    border-left: 3px solid transparent;
    
    i {
      margin-right: 12px;
      font-size: 18px;
      color: var(--muted);
    }
    
    span {
      color: var(--muted);
    }
    
    &.active {
      border-left-color: var(--primary);
      background: var(--nav-active);
      
      i {
        color: var(--primary);
      }
      
      span {
        color: var(--body-text);
        font-weight: 500;
      }
    }
    
    &.done {
      i {
        color: var(--success);
      }
      
      span {
        color: var(--body-text);
      }
    }
  }
}

.shell-error {
  > .icon-error {
    font-size: 48px;
  }
  
  h3 {
    margin: 20px 0 10px;
  }
  
  .error-message {
    font-size: 16px;
    color: var(--error);
    margin-bottom: 20px;
  }
  
  .error-details {
    text-align: left;
    background: var(--nav-bg);
    padding: 16px;
    border-radius: 4px;
    margin: 20px 0;
    border-left: 3px solid var(--error);
    
    p {
      margin: 8px 0;
      font-family: monospace;
      font-size: 13px;
      
      strong {
        color: var(--muted);
        margin-right: 8px;
      }
    }
  }
  
  .error-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 24px;
  }
}

.shell-connected {
  text-align: center;
  
  .icon-checkmark {
    font-size: 24px;
    margin-right: 8px;
  }
}
</style>
