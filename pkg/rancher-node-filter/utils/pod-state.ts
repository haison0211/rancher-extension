/** Pods whose containers have all stopped for good: they use exactly 0 CPU / RAM */
export function isPodTerminated(pod: any): boolean {
  const phase = pod?.status?.phase;

  return phase === 'Succeeded' || phase === 'Failed';
}
