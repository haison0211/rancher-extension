/**
 * HTTP Proxy Request Composable
 * 
 * Provides safe HTTP proxy functionality for Pods and Services
 * via Rancher's Kubernetes API proxy mechanism.
 * 
 * Compatible with Rancher 2.13.1
 */

import { ref, Ref } from 'vue';

export interface ProxyRequestOptions {
  clusterId: string;
  namespace: string;
  resourceType: 'pod' | 'service';
  resourceName: string;
  port: number | string;
  path?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  timeout?: number;
  maxResponseSize?: number;
}

export interface ProxyResponse {
  status: number;
  statusText: string;
  data: string;
  contentType: string;
  truncated: boolean;
  size: number;
}

export interface ProxyError {
  code: string;
  message: string;
  details?: string;
}

/**
 * Build safe proxy URL
 */
function buildProxyUrl(options: ProxyRequestOptions): string {
  const { clusterId, namespace, resourceType, resourceName, port, path } = options;
  
  // Validate inputs
  if (!clusterId || !namespace || !resourceName || !port) {
    throw new Error('Missing required parameters for proxy URL');
  }
  
  // Ensure port is a string
  const portStr = String(port);
  
  // Clean path - remove leading/trailing slashes, encode properly
  let cleanPath = (path || '/').trim();
  if (!cleanPath.startsWith('/')) {
    cleanPath = '/' + cleanPath;
  }
  
  // Encode path components properly (but not the slashes)
  const encodedPath = cleanPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  
  // Build URL based on resource type
  const resourceTypePlural = resourceType === 'pod' ? 'pods' : 'services';
  const baseUrl = `/k8s/clusters/${clusterId}/api/v1/namespaces/${namespace}/${resourceTypePlural}`;
  
  // Format: {name}:{port}
  const resourceWithPort = `${resourceName}:${portStr}`;
  
  // Complete proxy URL
  return `${baseUrl}/${resourceWithPort}/proxy${encodedPath}`;
}

/**
 * Execute HTTP proxy request with safety controls
 */
export function useProxyRequest() {
  const loading: Ref<boolean> = ref(false);
  const error: Ref<ProxyError | null> = ref(null);
  const response: Ref<ProxyResponse | null> = ref(null);
  
  /**
   * Execute proxy request
   */
  async function execute(
    axios: any,
    options: ProxyRequestOptions
  ): Promise<ProxyResponse> {
    loading.value = true;
    error.value = null;
    response.value = null;
    
    const timeout = options.timeout || 10000; // 10s default
    const maxSize = options.maxResponseSize || 1024 * 1024; // 1MB default
    
    try {
      // Build proxy URL
      const url = buildProxyUrl(options);
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        // Execute request with Rancher's axios instance
        const result = await axios({
          url,
          method: options.method || 'GET',
          signal: controller.signal,
          // Don't parse JSON automatically - we need raw response
          transformResponse: [(data: any) => data],
          // Prevent axios from throwing on non-2xx status
          validateStatus: () => true,
        });
        
        clearTimeout(timeoutId);
        
        // Check response size
        const responseData = result.data || '';
        const responseStr = typeof responseData === 'string' 
          ? responseData 
          : JSON.stringify(responseData, null, 2);
        
        const size = new Blob([responseStr]).size;
        const truncated = size > maxSize;
        
        // Truncate if needed
        const finalData = truncated 
          ? responseStr.substring(0, maxSize) + '\n\n[...Response truncated - exceeded 1MB limit]'
          : responseStr;
        
        // Build response object
        const proxyResponse: ProxyResponse = {
          status: result.status,
          statusText: result.statusText,
          data: finalData,
          contentType: result.headers['content-type'] || 'text/plain',
          truncated,
          size,
        };
        
        response.value = proxyResponse;
        
        // Handle error status codes from Kubernetes API (not from proxied application)
        // Note: 404 can be from the application itself (path not found), so we don't throw for it
        if (result.status === 401) {
          throw {
            code: 'UNAUTHORIZED',
            message: 'Unauthorized - Please re-authenticate',
            details: 'Your session may have expired.',
          };
        } else if (result.status === 403) {
          throw {
            code: 'FORBIDDEN',
            message: 'Forbidden - Insufficient RBAC Permissions',
            details: `You do not have permission to proxy this ${options.resourceType}. Required RBAC: 'get' on '${options.resourceType}s/proxy' in namespace '${options.namespace}'.`,
          };
        } else if (result.status === 503) {
          throw {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service Unavailable',
            details: `The ${options.resourceType} may not be ready, the endpoint is not responding, or port ${options.port} is not exposed/available on the ${options.resourceType}.`,
          };
        } else if (result.status >= 500) {
          throw {
            code: 'SERVER_ERROR',
            message: `Server Error (${result.status})`,
            details: result.statusText || 'Internal server error occurred.',
          };
        }
        
        // For all other status codes (including 404), return as normal response
        // This allows users to see the actual response from the application
        return proxyResponse;
        
      } catch (err: any) {
        clearTimeout(timeoutId);
        
        // Handle abort (timeout)
        if (err.name === 'AbortError' || err.code === 'ECONNABORTED') {
          throw {
            code: 'TIMEOUT',
            message: 'Request Timeout',
            details: `The proxy request exceeded the ${timeout}ms timeout limit. The ${options.resourceType} may be slow to respond or unreachable.`,
          };
        }
        
        // Re-throw if already a ProxyError
        if (err.code && err.message) {
          throw err;
        }
        
        // Network or other errors
        throw {
          code: 'NETWORK_ERROR',
          message: 'Network Error',
          details: err.message || 'Failed to connect to the proxy endpoint.',
        };
      }
      
    } catch (err: any) {
      // Set error state
      error.value = err as ProxyError;
      throw err;
      
    } finally {
      loading.value = false;
    }
  }
  
  /**
   * Reset state
   */
  function reset() {
    loading.value = false;
    error.value = null;
    response.value = null;
  }
  
  return {
    loading,
    error,
    response,
    execute,
    reset,
  };
}

/**
 * Validate proxy request options
 */
export function validateProxyOptions(options: Partial<ProxyRequestOptions>): string | null {
  if (!options.clusterId) {
    return 'Cluster ID is required';
  }
  
  if (!options.namespace) {
    return 'Namespace is required';
  }
  
  if (!options.resourceName) {
    return 'Resource name is required';
  }
  
  if (!options.resourceType || !['pod', 'service'].includes(options.resourceType)) {
    return 'Resource type must be "pod" or "service"';
  }
  
  if (!options.port) {
    return 'Port is required';
  }
  
  const portNum = typeof options.port === 'string' ? parseInt(options.port, 10) : options.port;
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return 'Port must be a valid number between 1 and 65535';
  }
  
  return null;
}
