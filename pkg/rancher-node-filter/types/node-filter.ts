/**
 * Node Label Filter Types
 * Type definitions for Node label filtering functionality
 */

/**
 * Label key option for dropdown
 */
export interface LabelKeyOption {
  label: string;
  value: string;
}

/**
 * Node metadata structure (simplified from K8s)
 */
export interface NodeMetadata {
  name: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

/**
 * Node resource structure (simplified)
 */
export interface NodeResource {
  id: string;
  type: string;
  metadata: NodeMetadata;
  spec: {
    taints?: Array<{
      key: string;
      value: string;
      effect: string;
    }>;
  };
  status: {
    nodeInfo: {
      operatingSystem: string;
      kubeletVersion: string;
      [key: string]: any;
    };
    images?: Array<{
      names: string[];
      sizeBytes: number;
    }>;
  };
  displayLabels?: boolean;
  displayTaintsAndLabels?: boolean;
  customLabels?: string[];
  customLabelCount?: number;
  podConsumedUsage?: string;
}

/**
 * Label filter state
 */
export interface LabelFilterState {
  selectedLabelKey: string | null;
  labelValue: string;
  allLabelKeys: string[];
}

/**
 * System label prefixes to filter out
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
  // Check exact matches
  if (SYSTEM_LABEL_KEYS.includes(key as any)) {
    return true;
  }
  
  // Check prefixes
  return SYSTEM_LABEL_PREFIXES.some(prefix => key.startsWith(prefix));
}

/**
 * Filter node by label key and value
 */
export function matchesLabelFilter(
  node: NodeResource,
  labelKey: string | null,
  labelValue: string
): boolean {
  if (!labelKey || !labelValue.trim()) {
    return true; // No filter applied
  }

  const labels = node.metadata?.labels || {};
  const nodeValue = labels[labelKey];

  if (!nodeValue) {
    return false; // Node doesn't have this label
  }

  // Case-insensitive partial match
  return nodeValue.toLowerCase().includes(labelValue.toLowerCase().trim());
}
