/**
 * Service Model Extension
 * Adds HTTP Proxy action to Service resources
 * 
 * Compatible with Rancher 2.13.1
 */

import Service from '@shell/models/service';

export default class ExtendedService extends Service {
  /**
   * Add HTTP Proxy action to Service - positioned between Clone and Download YAML
   */
  get availableActions() {
    // Get base actions
    const actions = super.availableActions || [];
    
    // Check if service is ExternalName type
    const isExternalName = this.spec?.type === 'ExternalName';
    
    // Check if service has ports
    const hasPorts = this.spec?.ports && this.spec.ports.length > 0;
    
    // Add Proxy action
    const proxyAction = {
      action: 'proxyHttpEndpoint',
      label: 'Proxy HTTP',
      icon: 'icon-globe',
      enabled: !isExternalName && hasPorts,
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
   * Execute proxy action - opens new tab with security
   */
  proxyHttpEndpoint() {
    const clusterId = this.$rootGetters['clusterId'];
    const namespace = this.metadata?.namespace;
    const name = this.metadata?.name;
    const clusterIP = this.spec?.clusterIP;

    if (!clusterIP || clusterIP === 'None') {
      console.error('[Service] No Cluster IP available');
      return;
    }

    // Build URL parameters
    const params = new URLSearchParams({
      namespace,
      name,
      ip: clusterIP,
      type: 'service',
    }).toString();

    // Open in new tab with security
    const url = `/c/${clusterId}/explorer/service-proxy?${params}`;
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    
    if (!popup) {
      console.error('[Service] Popup blocked by browser');
    }
  }
}
