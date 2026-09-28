/**
 * Node label filter helpers
 */

/**
 * System label prefixes hidden from the label key dropdown
 */
export const SYSTEM_LABEL_PREFIXES = [
  'beta.kubernetes.io',
  'node.kubernetes.io',
] as const;

export const SYSTEM_LABEL_KEYS = [
  'kubernetes.io/arch',
  'kubernetes.io/hostname',
  'kubernetes.io/os',
] as const;

/**
 * Check if a label key is a system label
 */
export function isSystemLabel(key: string): boolean {
  if (SYSTEM_LABEL_KEYS.includes(key as any)) {
    return true;
  }

  return SYSTEM_LABEL_PREFIXES.some((prefix) => key.startsWith(prefix));
}
