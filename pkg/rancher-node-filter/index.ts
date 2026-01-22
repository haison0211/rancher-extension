import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';

// Init the package
export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // Register custom list component for Node resource
  // This overrides the default Node list view in Explorer
  // allowing us to customize the filter behavior to include node labels
  plugin.register('list', 'node', () => import('./list/node.vue'));
}
