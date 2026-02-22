/**
 * Security Utilities for Kubernetes Resource Names
 * 
 * Sanitizes input to prevent XSS and injection attacks
 */

/**
 * Sanitize Kubernetes resource name
 * K8s names must match: [a-z0-9]([-a-z0-9]*[a-z0-9])?
 * 
 * @param name - Resource name from user input or API
 * @returns Sanitized name safe for URL construction
 */
export function sanitizeK8sName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  // Remove characters not allowed in K8s names
  // Keep only: lowercase letters, numbers, hyphens
  return name.replace(/[^a-z0-9-]/gi, '').toLowerCase();
}

/**
 * Sanitize cluster ID
 * Cluster IDs follow K8s naming conventions
 */
export function sanitizeClusterId(clusterId: string): string {
  return sanitizeK8sName(clusterId);
}

/**
 * Sanitize namespace name
 * Namespaces follow K8s naming conventions
 */
export function sanitizeNamespace(namespace: string): string {
  return sanitizeK8sName(namespace);
}

/**
 * Sanitize resource name (pod/service)
 * Resource names follow K8s naming conventions
 */
export function sanitizeResourceName(resourceName: string): string {
  return sanitizeK8sName(resourceName);
}

/**
 * Validate port number
 * @param port - Port number to validate
 * @returns Validated port number or null if invalid
 */
export function validatePort(port: number | string): number | null {
  const portNum = typeof port === 'string' ? parseInt(port, 10) : port;
  
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return null;
  }
  
  return portNum;
}
