import { importTypes } from '@rancher/auto-import';
import {
  IPlugin, ActionLocation, PanelLocation, TableColumnLocation
} from '@shell/core/types';
import { isNodeReady } from './utils/node-state';

/**
 * Rancher Node & Pod Extension
 *
 * Rancher waits for this entry chunk before it renders anything (on every page load / F5),
 * so it must stay tiny: only extension-point registrations live here and everything else is
 * lazy-imported.
 *
 * Do not add a `models/` folder. Auto-import loads models eagerly (`require`), which pulls the
 * whole @shell model hierarchy (lodash, highlight.js, diff, ...) into this chunk and replaces
 * Rancher's own pod/node/service models with an older bundled copy.
 *
 * Do not load pods into the `cluster` store from background code (e.g. a cluster-wide
 * `findAll` pod). Rancher's workload detail page then returns every pod in the store as the
 * workload's pods (`matchingLabelSelector` checks `haveSelector` before `haveAll`).
 */

function openProxyModal(resource: any, resourceType: 'pod' | 'service'): void {
  resource.$dispatch('promptModal', {
    component:      'NodeFilterProxyModal',
    modalWidth:     '1100px',
    componentProps: {
      resource,
      resourceType,
      clusterId: resource.$rootGetters['clusterId'],
    },
  });
}

/**
 * Live CPU / RAM columns for the native Pod list.
 *
 * The same definition is passed as the server-side pagination column: metrics are not part of the
 * pod object, so the value is rendered by the formatter and the column is neither sortable nor
 * searchable (the Top pods panel covers "which pods are heavy").
 */
function podMetricColumn(kind: 'cpu' | 'memory') {
  return {
    name:          `node-filter-${ kind }`,
    label:         kind === 'cpu' ? 'CPU' : 'RAM',
    value:         'metadata.name',
    formatter:     'NodeFilterPodMetric',
    formatterOpts: { kind },
    sort:          false as const,
    search:        false as const,
    width:         110,
    align:         'right',
  };
}

export default function(plugin: IPlugin): void {
  importTypes(plugin);

  // Pod list: keep Rancher's own (server-side paginated) list, add live usage on top of it
  plugin.addTableColumn(TableColumnLocation.RESOURCE, { resource: ['pod'] }, podMetricColumn('cpu'), podMetricColumn('cpu'));
  plugin.addTableColumn(TableColumnLocation.RESOURCE, { resource: ['pod'] }, podMetricColumn('memory'), podMetricColumn('memory'));
  plugin.addPanel(PanelLocation.RESOURCE_LIST, { resource: ['pod'] }, { component: () => import(/* webpackChunkName: "top-pods" */ './components/TopPodsPanel.vue') });

  plugin.addAction(ActionLocation.TABLE, { resource: ['pod'] }, {
    label:    'Proxy HTTP',
    icon:     'icon-globe',
    multiple: false,
    enabled:  (pod: any) => pod?.status?.phase === 'Running' && !!pod?.status?.podIP,
    invoke:   (opts: any, resources: any[]) => openProxyModal(resources[0], 'pod'),
  });

  plugin.addAction(ActionLocation.TABLE, { resource: ['service'] }, {
    label:    'Proxy HTTP',
    icon:     'icon-globe',
    multiple: false,
    enabled:  (service: any) => service?.spec?.type !== 'ExternalName' && !!service?.spec?.ports?.length,
    invoke:   (opts: any, resources: any[]) => openProxyModal(resources[0], 'service'),
  });

  plugin.addAction(ActionLocation.TABLE, { resource: ['node'] }, {
    label:    'Shell',
    icon:     'icon-terminal',
    multiple: false,
    enabled:  isNodeReady,
    invoke:   (opts: any, resources: any[]) => {
      import(/* webpackChunkName: "node-shell" */ './utils/node-shell').then(({ openNodeShell }) => openNodeShell(resources[0]));
    },
  });
}
