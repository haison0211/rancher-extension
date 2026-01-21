import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';

// Init the package
export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit, list from the folders
  // This will auto-load detail/node.vue as a tab component
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // Register custom list component for Pod resource
  // This will override the default Pod list view in Explorer
  plugin.register('list', 'pod', () => import('./list/pod.vue'));
}
