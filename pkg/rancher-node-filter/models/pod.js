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
   * Execute proxy action - opens in new browser tab
   */
  proxyHttpEndpoint() {
    const clusterId = this.$rootGetters['currentCluster']?.id || 'local';
    const namespace = this.metadata?.namespace || 'default';
    const name = this.metadata?.name || 'unknown';
    
    // Build URL with query params to pass resource data
    const params = new URLSearchParams({
      cluster: clusterId,
      namespace,
      name,
      type: 'pod',
    });
    
    // Open proxy page in new browser tab
    const url = `/c/${clusterId}/explorer/pod-proxy?${params.toString()}`;
    window.open(url, '_blank');
  }
}
