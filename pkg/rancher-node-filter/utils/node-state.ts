/** Shell into a node is only offered for Ready (Rancher state "active") nodes */
export function isNodeReady(node: any): boolean {
  const state = `${ node?.state || '' }`.toLowerCase();
  const stateDisplay = `${ node?.stateDisplay || '' }`.toLowerCase();

  return ['active', 'ready'].includes(state) || ['active', 'ready'].includes(stateDisplay);
}
