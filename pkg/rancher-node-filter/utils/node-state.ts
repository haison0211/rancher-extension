/** Shell into a node is only offered for Ready (Rancher state "active") nodes */
export function isNodeReady(node: any): boolean {
  const state = `${ node?.state || '' }`.toLowerCase();
  const stateDisplay = `${ node?.stateDisplay || '' }`.toLowerCase();

  return ['active', 'ready'].includes(state) || ['active', 'ready'].includes(stateDisplay);
}

/**
 * Rancher 2.15+ feature flags that switch shell access off:
 * - `node-shell`: Rancher's own node (SSH) shell, so an admin turning it off does not want node shells
 * - `pod-shell`: pod exec, which the server then refuses, and this shell is an exec into a pod
 *
 * Older Rancher has neither flag (a missing flag means "on"), so the Shell behaves as before there.
 */
const SHELL_FEATURE_FLAGS = ['node-shell', 'pod-shell'];

export function isShellFeatureEnabled(rootGetters: any): boolean {
  const byId = rootGetters?.['management/byId'];

  return SHELL_FEATURE_FLAGS.every((id) => byId?.('management.cattle.io.feature', id)?.enabled !== false);
}

/** Node table action: Rancher hides an action whose `enabled` is false */
export function canOpenNodeShell(node: any): boolean {
  return isShellFeatureEnabled(node?.$rootGetters) && isNodeReady(node);
}
