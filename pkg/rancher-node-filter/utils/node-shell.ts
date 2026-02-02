/**
 * Node Shell Utilities
 * 
 * Core logic for creating, managing, and cleaning up node shell pods
 * Implements Lens-compatible behavior with enhanced error handling
 */

import { POD, NAMESPACE } from '@shell/config/types';
import { NODE_SHELL_CONFIG, type ShellPodOptions, type NodeShellPod } from '../types/node-shell';

/**
 * Generate unique pod name with UUID suffix (Lens-compatible)
 */
export function generatePodName(): string {
  const uuid = crypto.randomUUID();
  return `${NODE_SHELL_CONFIG.POD_PREFIX}${uuid}`;
}

/**
 * Build pod manifest for node shell (Lens-equivalent)
 * 
 * Key differences from standard pod:
 * - Privileged container with nsenter
 * - hostPID, hostIPC, hostNetwork enabled
 * - system-node-critical priority
 * - tolerates all taints
 * - scheduled directly to target node
 */
export function buildShellPodManifest(options: ShellPodOptions): any {
  const { nodeName, namespace = NODE_SHELL_CONFIG.NAMESPACE, podName = generatePodName() } = options;
  
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + NODE_SHELL_CONFIG.SHELL_TIMEOUT).toISOString();

  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: podName,
      namespace,
      labels: {
        app: NODE_SHELL_CONFIG.LABELS.APP,
        'app.kubernetes.io/managed-by': NODE_SHELL_CONFIG.LABELS.MANAGED_BY,
        'node-shell/target-node': nodeName,
      },
      annotations: {
        [NODE_SHELL_CONFIG.ANNOTATIONS.NODE_NAME]: nodeName,
        [NODE_SHELL_CONFIG.ANNOTATIONS.CREATED_AT]: now,
        [NODE_SHELL_CONFIG.ANNOTATIONS.EXPIRES_AT]: expiresAt,
      }
    },
    spec: {
      // Critical: Schedule directly to target node
      nodeName,
      
      // Host access (required for nsenter)
      hostNetwork: true,
      hostPID: true,
      hostIPC: true,
      
      // High priority to avoid eviction
      priorityClassName: NODE_SHELL_CONFIG.PRIORITY_CLASS,
      
      // Don't restart on failure
      restartPolicy: 'Never',
      
      // Tolerate all taints (schedule even on tainted nodes)
      tolerations: [
        {
          operator: 'Exists'
        }
      ],
      
      // Immediate termination
      terminationGracePeriodSeconds: 0,
      
      containers: [
        {
          name: 'shell',
          image: NODE_SHELL_CONFIG.IMAGE,
          imagePullPolicy: 'IfNotPresent',
          
          // nsenter command: enter node's namespaces
          command: ['nsenter'],
          args: [
            '-t', '1',      // Target PID 1 (init process)
            '-m',           // Mount namespace
            '-u',           // UTS namespace (hostname)
            '-i',           // IPC namespace
            '-n',           // Network namespace
            'sleep',        // Keep container alive
            '14000'         // ~4 hours (safety buffer)
          ],
          
          // Privileged mode (required for nsenter)
          securityContext: {
            privileged: true
          },
          
          resources: {}  // No resource limits (best-effort)
        }
      ]
    }
  };
}

/**
 * Check if namespace exists, create if not
 */
export async function ensureNamespace(store: any, namespace: string = NODE_SHELL_CONFIG.NAMESPACE): Promise<boolean> {
  try {
    // Check if namespace exists
    const existingNs = await store.dispatch('cluster/find', {
      type: NAMESPACE,
      id: namespace,
      opt: { force: false }
    }).catch(() => null);
    
    if (existingNs) {
      return true;
    }
    
    // Create namespace
    const nsManifest = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: namespace,
        labels: {
          'app.kubernetes.io/managed-by': NODE_SHELL_CONFIG.LABELS.MANAGED_BY,
        }
      }
    };
    
    await store.dispatch('cluster/create', nsManifest);
    
    return true;
  } catch (error) {
    console.error('[NodeShell] Failed to ensure namespace:', error);
    return false;
  }
}

/**
 * Find existing active shell pod for a node
 */
export async function findExistingShellPod(store: any, nodeName: string): Promise<any | null> {
  try {
    const allPods = await store.dispatch('cluster/findAll', {
      type: POD,
      opt: { force: true }
    });
    
    const existingPod = allPods.find((pod: any) => {
      const targetNode = pod.metadata?.annotations?.[NODE_SHELL_CONFIG.ANNOTATIONS.NODE_NAME];
      const isShellPod = pod.metadata?.labels?.app === NODE_SHELL_CONFIG.LABELS.APP;
      const isRunning = ['Running', 'Pending'].includes(pod.status?.phase);
      
      return isShellPod && targetNode === nodeName && isRunning;
    });
    
    return existingPod || null;
  } catch (error) {
    console.error('[NodeShell] Failed to find existing pod:', error);
    return null;
  }
}

/**
 * Create shell pod for node
 */
export async function createShellPod(store: any, options: ShellPodOptions): Promise<any> {
  const { nodeName, namespace = NODE_SHELL_CONFIG.NAMESPACE } = options;
  
  // Ensure namespace exists
  const nsCreated = await ensureNamespace(store, namespace);
  if (!nsCreated) {
    throw new Error(`Failed to create or access namespace: ${namespace}`);
  }
  
  // Check for existing pod
  const existingPod = await findExistingShellPod(store, nodeName);
  if (existingPod) {
    console.log('[NodeShell] Reusing existing pod:', existingPod.metadata.name);
    return existingPod;
  }
  
  // Build and create new pod
  const podManifest = buildShellPodManifest({ nodeName, namespace });
  
  try {
    const createdPod = await store.dispatch('cluster/create', podManifest);
    console.log('[NodeShell] Created pod:', createdPod.metadata.name);
    return createdPod;
  } catch (error: any) {
    console.error('[NodeShell] Failed to create pod:', error);
    throw new Error(`Failed to create shell pod: ${error.message || error}`);
  }
}

/**
 * Wait for pod to be ready
 */
export async function waitForPodReady(
  store: any,
  namespace: string,
  podName: string,
  timeout: number = NODE_SHELL_CONFIG.WAIT_TIMEOUT
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const pod = await store.dispatch('cluster/find', {
        type: POD,
        id: `${namespace}/${podName}`,
        opt: { force: true }
      });
      
      // Check if pod is ready
      const phase = pod.status?.phase;
      const conditions = pod.status?.conditions || [];
      const readyCondition = conditions.find((c: any) => c.type === 'Ready');
      
      if (phase === 'Running' && readyCondition?.status === 'True') {
        return true;
      }
      
      // Check for failure states
      if (phase === 'Failed' || phase === 'Unknown') {
        throw new Error(`Pod entered ${phase} state`);
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, NODE_SHELL_CONFIG.WAIT_INTERVAL));
    } catch (error) {
      console.error('[NodeShell] Error checking pod status:', error);
      throw error;
    }
  }
  
  throw new Error('Timeout waiting for pod to be ready');
}

/**
 * Delete shell pod
 */
export async function deleteShellPod(store: any, namespace: string, podName: string): Promise<void> {
  try {
    const pod = await store.dispatch('cluster/find', {
      type: POD,
      id: `${namespace}/${podName}`,
      opt: { force: false }
    }).catch(() => null);
    
    if (pod) {
      await pod.remove();
      console.log('[NodeShell] Deleted pod:', podName);
    }
  } catch (error) {
    console.error('[NodeShell] Failed to delete pod:', error);
    throw error;
  }
}

/**
 * Cleanup expired shell pods (background task)
 */
export async function cleanupExpiredPods(store: any): Promise<number> {
  try {
    const allPods = await store.dispatch('cluster/findAll', {
      type: POD,
      opt: { force: true }
    });
    
    const now = Date.now();
    let cleaned = 0;
    
    for (const pod of allPods) {
      const isShellPod = pod.metadata?.labels?.app === NODE_SHELL_CONFIG.LABELS.APP;
      if (!isShellPod) continue;
      
      const expiresAtStr = pod.metadata?.annotations?.[NODE_SHELL_CONFIG.ANNOTATIONS.EXPIRES_AT];
      if (!expiresAtStr) continue;
      
      const expiresAt = new Date(expiresAtStr).getTime();
      if (now > expiresAt) {
        await deleteShellPod(store, pod.metadata.namespace, pod.metadata.name);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[NodeShell] Cleaned up ${cleaned} expired pods`);
    }
    
    return cleaned;
  } catch (error) {
    console.error('[NodeShell] Cleanup failed:', error);
    return 0;
  }
}

/**
 * Check if user has required permissions
 */
export async function checkPermissions(store: any): Promise<{ canShell: boolean; missingPerms: string[] }> {
  const missingPerms: string[] = [];
  
  // Check pod permissions
  const canListPods = !!store.getters['cluster/schemaFor'](POD);
  if (!canListPods) {
    missingPerms.push('list pods');
  }
  
  // Check namespace permissions
  const canListNamespaces = !!store.getters['cluster/schemaFor'](NAMESPACE);
  if (!canListNamespaces) {
    missingPerms.push('list namespaces');
  }
  
  // Note: We can't directly check create/delete/exec permissions without attempting
  // Those will be validated when user actually tries to shell
  
  return {
    canShell: missingPerms.length === 0,
    missingPerms
  };
}
