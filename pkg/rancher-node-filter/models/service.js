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
   * Execute proxy action - emit window custom event to open inline modal
   */
  proxyHttpEndpoint() {
    const clusterIP = this.spec?.clusterIP;

    if (!clusterIP || clusterIP === 'None') {
      console.error('[Service] No Cluster IP available');
      return;
    }

    // Emit window custom event to Service List component
    // Vue 3 removed $root.$on/$off, so use window.dispatchEvent instead
    window.dispatchEvent(new CustomEvent('proxy-modal:open', {
      detail: {
        resource: this,
        resourceType: 'service',
      }
    }));
  }
}
