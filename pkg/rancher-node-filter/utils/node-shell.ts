/**
 * Shell into Node (Lens-equivalent)
 *
 * Creates a privileged nsenter pod on the target node and opens Rancher's ContainerShell on it.
 *
 * Every API call goes through `cluster/request`, which never writes to the Vuex `cluster` store.
 * Loading pods into the store from here (as the old background cleanup job did with a cluster-wide
 * findAll) corrupts other pages: a Deployment detail page then shows every pod in the store.
 */

import { NODE_SHELL_CONFIG as CFG } from '../types/node-shell';
import { log } from './log';

type RootDispatch = (action: string, payload?: any) => Promise<any>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(err: any): number | undefined {
  return err?._status || err?.status || err?.response?.status;
}

function messageOf(err: any): string {
  return err?.message || err?.data?.message || err?._statusText || String(err);
}

function podsUrl(clusterId: string, name?: string): string {
  const base = `/k8s/clusters/${ clusterId }/v1/pods/${ CFG.NAMESPACE }`;

  return name ? `${ base }/${ name }` : base;
}

async function ensureNamespace(dispatch: RootDispatch, clusterId: string): Promise<void> {
  try {
    await dispatch('cluster/request', { url: `/k8s/clusters/${ clusterId }/v1/namespaces/${ CFG.NAMESPACE }` });
  } catch (err) {
    // 403: the user may create shell pods without being allowed to read the namespace object.
    // Carry on; creating the pod will fail with a clear error if the namespace really is missing.
    if (statusOf(err) === 403) {
      return;
    }
    if (statusOf(err) !== 404) {
      throw err;
    }

    await dispatch('cluster/request', {
      url:    `/k8s/clusters/${ clusterId }/v1/namespaces`,
      method: 'POST',
      data:   {
        apiVersion: 'v1',
        kind:       'Namespace',
        metadata:   { name: CFG.NAMESPACE, labels: { 'app.kubernetes.io/managed-by': CFG.LABELS.MANAGED_BY } }
      }
    });
  }
}

/**
 * Delete shell pods that have finished or outlived MAX_AGE_MS.
 *
 * Runs only when someone opens a shell, scoped to one namespace and one label.
 * Failures are ignored: a leftover pod is harmless (activeDeadlineSeconds stops it anyway).
 */
async function cleanupStaleShellPods(dispatch: RootDispatch, clusterId: string): Promise<void> {
  try {
    const res = await dispatch('cluster/request', { url: `${ podsUrl(clusterId) }?labelSelector=app%3D${ CFG.LABELS.APP }` });
    const now = Date.now();
    const stale = (res?.data || []).filter((pod: any) => {
      // Re-check the label: never delete anything that is not a shell pod, even if the selector was ignored
      if (pod.metadata?.labels?.app !== CFG.LABELS.APP) {
        return false;
      }
      const phase = pod.status?.phase;
      const createdAt = pod.metadata?.annotations?.[CFG.ANNOTATIONS.CREATED_AT] || pod.metadata?.creationTimestamp;
      const age = createdAt ? now - new Date(createdAt).getTime() : 0;

      return phase === 'Succeeded' || phase === 'Failed' || age > CFG.MAX_AGE_MS;
    });

    await Promise.allSettled(stale.map((pod: any) => dispatch('cluster/request', {
      url:    podsUrl(clusterId, pod.metadata.name),
      method: 'DELETE'
    })));
  } catch (err) {
    log.warn('[NodeShell] Cleanup of old shell pods skipped:', messageOf(err));
  }
}

function buildPodManifest(nodeName: string) {
  const podName = `${ CFG.POD_PREFIX }${ Date.now().toString(36) }-${ Math.random().toString(36).substr(2, 6) }`;

  return {
    apiVersion: 'v1',
    kind:       'Pod',
    metadata:   {
      name:      podName,
      namespace: CFG.NAMESPACE,
      labels:    {
        app:                          CFG.LABELS.APP,
        'app.kubernetes.io/managed-by': CFG.LABELS.MANAGED_BY,
      },
      annotations: {
        [CFG.ANNOTATIONS.NODE_NAME]:  nodeName,
        [CFG.ANNOTATIONS.CREATED_AT]: new Date().toISOString(),
      }
    },
    spec: {
      nodeName, // Schedule directly to target node
      hostPID:                       true,
      hostIPC:                       true,
      hostNetwork:                   true,
      restartPolicy:                 'Never',
      terminationGracePeriodSeconds: 0,
      activeDeadlineSeconds:         CFG.ACTIVE_DEADLINE_SECONDS,
      priorityClassName:             CFG.PRIORITY_CLASS,
      tolerations:                   [{ operator: 'Exists' }],
      containers:                    [{
        name:            'shell',
        image:           CFG.IMAGE,
        command:         ['nsenter'],
        args:            ['-t', '1', '-m', '-u', '-i', '-n', 'sleep', String(CFG.ACTIVE_DEADLINE_SECONDS)],
        securityContext: { privileged: true },
        resources:       {}
      }]
    }
  };
}

async function waitForRunning(dispatch: RootDispatch, clusterId: string, name: string): Promise<any> {
  const deadline = Date.now() + CFG.WAIT_TIMEOUT_MS;
  let interval = CFG.WAIT_INITIAL_INTERVAL_MS;

  while (Date.now() < deadline) {
    const pod = await dispatch('cluster/request', { url: podsUrl(clusterId, name) });
    const phase = pod?.status?.phase;

    if (phase === 'Running') {
      return pod;
    }

    if (phase === 'Failed' || phase === 'Succeeded') {
      throw new Error(`Shell pod stopped before it was ready (${ phase }): ${ pod?.status?.message || pod?.status?.reason || 'unknown reason' }`);
    }

    await sleep(interval);
    interval = Math.min(Math.round(interval * 1.5), CFG.WAIT_MAX_INTERVAL_MS);
  }

  throw new Error(`Timed out after ${ CFG.WAIT_TIMEOUT_MS / 1000 }s waiting for the shell pod to start`);
}

/**
 * Entry point used by the node table action and the node detail page.
 *
 * @param node Rancher node model (provides $dispatch / $rootGetters bound to the right store)
 */
export async function openNodeShell(node: any): Promise<void> {
  const dispatch: RootDispatch = (action, payload) => node.$dispatch(action, payload, { root: true });
  const clusterId = node.$rootGetters['clusterId'];
  const nodeName = node.metadata?.name;

  try {
    dispatch('growl/info', {
      title:   `Creating shell pod for ${ node.nameDisplay || nodeName }`,
      message: 'Please wait...',
      timeout: 3000
    });

    await ensureNamespace(dispatch, clusterId);
    await cleanupStaleShellPods(dispatch, clusterId);

    const manifest = buildPodManifest(nodeName);

    await dispatch('cluster/request', {
      url:    podsUrl(clusterId),
      method: 'POST',
      data:   manifest
    });

    const running = await waitForRunning(dispatch, clusterId, manifest.metadata.name);

    // Classify into a Pod model WITHOUT adding it to the store, then reuse Rancher's own shell window
    const pod = await dispatch('cluster/create', running);

    pod.openShell('shell');
  } catch (err) {
    const forbidden = statusOf(err) === 403;

    log.error('[NodeShell] Failed to open shell:', err);
    dispatch('growl/error', {
      title:   'Failed to open shell',
      message: forbidden ? `You need a role that can create pods and exec into them in namespace ${ CFG.NAMESPACE }.` : messageOf(err),
      timeout: 8000
    });
  }
}
