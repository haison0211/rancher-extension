/**
 * Pod Model Extension
 * Adds HTTP Proxy action to Pod resources
 * 
 * Compatible with Rancher 2.13.1
 */

import Pod from '@shell/models/pod';

export default class ExtendedPod extends Pod {
  /**
   * Add HTTP Proxy action to Pod - positioned between Clone and Download YAML
   */
  get availableActions() {
    // Get base actions
    const actions = super.availableActions || [];
    
    // Check if pod is running
    const isRunning = this.status?.phase === 'Running';
    
    // Add Proxy action
    const proxyAction = {
      action: 'proxyHttpEndpoint',
      label: 'Proxy HTTP',
      icon: 'icon-globe',
      enabled: isRunning,
      bulkable: false,
    };
    
    // Find position: after Clone, before Download YAML
    const cloneIndex = actions.findIndex(a => a.action === 'goToClone');
    const downloadIndex = actions.findIndex(a => a.action === 'download');
    
    // Insert proxy action at appropriate position
    if (cloneIndex >= 0) {
      // Insert after Clone
      actions.splice(cloneIndex + 1, 0, proxyAction);
    } else if (downloadIndex >= 0) {
      // Insert before Download YAML
      actions.splice(downloadIndex, 0, proxyAction);
    } else {
      // Fallback: add at end
      actions.push(proxyAction);
    }
    
    return actions;
  }
  
  /**
   * Execute proxy action - emit window custom event to open inline modal
   */
  proxyHttpEndpoint() {
    const podIP = this.status?.podIP;

    if (!podIP) {
      console.error('[Pod] No Pod IP available');
      return;
    }

    // Emit window custom event to Pod List component
    // Vue 3 removed $root.$on/$off, so use window.dispatchEvent instead
    window.dispatchEvent(new CustomEvent('proxy-modal:open', {
      detail: {
        resource: this,
        resourceType: 'pod',
      }
    }));
  }
}
