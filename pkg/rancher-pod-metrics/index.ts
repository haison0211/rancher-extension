import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';

// Init the package
export default function(plugin: IPlugin): void {
  // NOTE: DO NOT use importTypes() here!
  // It will auto-load detail/node.vue which conflicts with rancher-node-filter extension
  // importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // Register custom list component for Pod resource
  // This will override the default Pod list view in Explorer
  plugin.register('list', 'pod', () => import('./list/pod.vue'));
  
  // NOTE: detail/node.vue is NOT loaded to avoid conflict with rancher-node-filter
  // If rancher-node-filter is not installed, pods in node detail won't have metrics
  // This is acceptable trade-off to prevent extension conflicts
}
