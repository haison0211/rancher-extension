import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';

/**
 * Rancher Node Filter Extension
 * 
 * Features:
 * 1. Label Filtering: Filter nodes by custom labels in Node List
 * 2. Synchronized Metrics: Fix CPU/RAM metrics discrepancy between Node List and Node Detail
 * 
 * How it works:
 * - importTypes() auto-imports models from ./models/ folder
 * - models/cluster/node.js overrides the default ClusterNode model
 * - This ensures metrics in Node List match Node Detail (uses actual usage from metrics-server)
 */
export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit from the folders
  // This loads models/cluster/node.js which overrides the default ClusterNode
  // with synchronized metrics calculation (same as Node Detail view)
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // Register custom list component for Node resource
  // This overrides the default Node list view in Explorer
  // Features:
  // - Custom label filtering
  // - Synchronized metrics display (via overridden Node model)
  plugin.register('list', 'node', () => import('./list/node.vue'));
}
