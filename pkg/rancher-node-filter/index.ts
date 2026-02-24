import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';

/**
 * Rancher Node & Pod Extension v6.0.7
 */

// Background cleanup job for old shell pods
let cleanupInterval: NodeJS.Timeout | null = null;

async function cleanupOldShellPods(): Promise<void> {
  try {
    const store = (window as any).$nuxt?.$store;
    if (!store) {
      console.warn('[NodeShell Cleanup] Store not available yet');
      return;
    }
    
    const POD = 'pod';
    const namespace = 'node-shell';
    
    const allPods = await store.dispatch('cluster/findAll', { 
      type: POD,
      opt: { force: true } 
    });
    
    const shellPods = allPods.filter((pod: any) => 
      pod.metadata?.namespace === namespace &&
      pod.metadata?.labels?.app === 'node-shell'
    );
    
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;
    let deletedCount = 0;
    
    for (const pod of shellPods) {
      const createdAt = pod.metadata?.annotations?.['rancher-node-filter.io/created-at'];
      const age = createdAt ? now - new Date(createdAt).getTime() : 0;
      
      const isCompleted = pod.status?.phase === 'Succeeded' || pod.status?.phase === 'Failed';
      const isTooOld = createdAt && age > maxAge;
      
      if (isCompleted || isTooOld) {
        try {
          await pod.remove();
          deletedCount++;
          const reason = isCompleted ? `completed (${pod.status?.phase})` : `too old (age: ${Math.round(age / 60000)}m)`;
          console.log(`[NodeShell Cleanup] Deleted pod: ${pod.metadata.name} - reason: ${reason}`);
        } catch (error) {
          console.error('[NodeShell Cleanup] Failed to delete pod:', pod.metadata.name, error);
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[NodeShell Cleanup] Cleanup completed: ${deletedCount} pod(s) deleted`);
    }
  } catch (error) {
    console.error('[NodeShell Cleanup] Cleanup job failed:', error);
  }
}

function startCleanupJob(): void {
  if (cleanupInterval) {
    return;
  }
  
  console.log('[NodeShell] Background cleanup job started (runs every 5 minutes)');
  
  setTimeout(() => {
    cleanupOldShellPods();
  }, 30000);
  
  cleanupInterval = setInterval(() => {
    cleanupOldShellPods();
  }, 5 * 60 * 1000);
}

export default function(plugin: IPlugin): void {
  importTypes(plugin);

  plugin.register('list', 'node', () => import('./list/node.vue'));
  plugin.register('list', 'pod', () => import('./list/pod.vue'));
  plugin.register('list', 'service', () => import('./list/service.vue'));
  plugin.register('detail', 'node', () => import('./detail/node.vue'));
  
  startCleanupJob();

  // NOTE: HTTP Proxy now uses inline modal instead of routes
  // No need to register routes - modal opens directly in Pod/Service list
}
