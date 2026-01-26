/**
 * Prometheus Configuration Utility
 * 
 * Manages Prometheus endpoint configuration for disk metrics
 * Uses localStorage to persist user settings
 */

const STORAGE_KEY = 'rancher-node-filter.prometheus-endpoint';
const DEFAULT_ENDPOINT = 'ops/services/ops-prometheus-server:80';

/**
 * Get configured Prometheus endpoint
 * @returns {string} Prometheus endpoint (namespace/service:port format)
 */
export function getPrometheusEndpoint() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored || DEFAULT_ENDPOINT;
  } catch (error) {
    console.warn('[PrometheusConfig] Error reading from localStorage:', error);
    return DEFAULT_ENDPOINT;
  }
}

/**
 * Set Prometheus endpoint
 * @param {string} endpoint - Prometheus endpoint in format: namespace/services/service-name:port
 */
export function setPrometheusEndpoint(endpoint) {
  try {
    if (!endpoint || typeof endpoint !== 'string') {
      console.warn('[PrometheusConfig] Invalid endpoint:', endpoint);
      return false;
    }
    
    localStorage.setItem(STORAGE_KEY, endpoint.trim());
    return true;
  } catch (error) {
    console.error('[PrometheusConfig] Error saving to localStorage:', error);
    return false;
  }
}

/**
 * Reset to default Prometheus endpoint
 */
export function resetPrometheusEndpoint() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('[PrometheusConfig] Error removing from localStorage:', error);
    return false;
  }
}

/**
 * Get default endpoint value
 * @returns {string}
 */
export function getDefaultEndpoint() {
  return DEFAULT_ENDPOINT;
}

/**
 * Validate endpoint format
 * @param {string} endpoint
 * @returns {boolean}
 */
export function validateEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') {
    return false;
  }
  
  // Basic validation: should contain "/" and ":"
  // Format: namespace/services/service-name:port
  const trimmed = endpoint.trim();
  return trimmed.includes('/') && trimmed.includes(':');
}
