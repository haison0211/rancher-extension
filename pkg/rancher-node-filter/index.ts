import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';

/**
 * Rancher Node Filter Extension v4.0.0
 * 
 * Features:
 * 1. Label Filtering: Filter nodes by custom labels in Node List
 * 2. Synchronized Metrics: Fix CPU/RAM metrics discrepancy between Node List and Node Detail
 * 3. Shell into Node: Lens-equivalent node shell feature (v4.0.0)
 * 
 * How it works:
 * - importTypes() auto-imports models from ./models/ folder
 * - models/cluster/node.js overrides the default ClusterNode model
 * - This ensures metrics in Node List match Node Detail (uses actual usage from metrics-server)
 * - Adds "Shell" action to node list for direct node access (creates pod + opens ContainerShell)
 * - Background cleanup job removes shell pods older than 30 minutes
 */

// Background cleanup job for old shell pods
let cleanupInterval: NodeJS.Timeout | null = null;

async function cleanupOldShellPods(): Promise<void> {
  try {
    // Access store via window.$nuxt (available in browser context)
    const store = (window as any).$nuxt?.$store;
    if (!store) {
      console.warn('[NodeShell Cleanup] Store not available yet');
      return;
    }
    
    const POD = 'pod';
    const namespace = 'node-shell';
    
    // Get all pods in node-shell namespace
    const allPods = await store.dispatch('cluster/findAll', { 
      type: POD,
      opt: { force: true } 
    });
    
    const shellPods = allPods.filter((pod: any) => 
      pod.metadata?.namespace === namespace &&
      pod.metadata?.labels?.app === 'node-shell'
    );
    
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes (same as pod timeout for immediate cleanup)
    let deletedCount = 0;
    
    for (const pod of shellPods) {
      const createdAt = pod.metadata?.annotations?.['rancher-node-filter.io/created-at'];
      const age = createdAt ? now - new Date(createdAt).getTime() : 0;
      
      // Delete pods if:
      // 1. Completed/Failed status (immediate deletion)
      // 2. Older than maxAge (2 minutes)
      const isCompleted = pod.status?.phase === 'Succeeded' || pod.status?.phase === 'Failed';
      const isTooOld = createdAt && age > maxAge;
      
      const shouldDelete = isCompleted || isTooOld;
      
      if (shouldDelete) {
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
    return; // Already running
  }
  
  console.log('[NodeShell] Background cleanup job started (runs every 5 minutes)');
  
  // Initial cleanup after 30 seconds (give time for store to initialize)
  setTimeout(() => {
    cleanupOldShellPods();
  }, 30000);
  
  // Schedule periodic cleanup every 5 minutes
  cleanupInterval = setInterval(() => {
    cleanupOldShellPods();
  }, 5 * 60 * 1000); // 5 minutes
}

export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit from the folders
  // This loads models/cluster/node.js which overrides the default ClusterNode
  // with synchronized metrics calculation (same as Node Detail view)
  importTypes(plugin);

  // NOTE: plugin.metadata is automatically loaded from package.json by Rancher
  // No need to manually set it here

  // Register custom list component for Node resource
  // This overrides the default Node list view in Explorer
  // Features:
  // - Custom label filtering
  // - Synchronized metrics display (via overridden Node model)
  plugin.register('list', 'node', () => import('./list/node.vue'));

  // Register custom detail component for Node resource
  // Handles ?mode=shell query parameter for Shell into Node feature
  plugin.register('detail', 'node', () => import('./detail/node.vue'));

  // NOTE: No need to register NodeShell component anymore
  // Shell functionality is handled directly in node model's openNodeShell() method
  // It creates a pod and opens Rancher's built-in ContainerShell component
  
  // Start background cleanup job for shell pods
  // Runs every 5 minutes to delete completed/failed pods or pods older than 30 minutes
  startCleanupJob();
}

