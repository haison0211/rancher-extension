import type { PodMetricsResponse, PodMetricsItem, ParsedMetrics } from '../types/pod-metrics';

/**
 * Parse CPU value from Kubernetes format to millicores
 * Examples: "123m" -> 123, "1234n" -> 0.001234, "2" -> 2000
 */
export function parseCPU(cpu: string): number {
  if (!cpu || typeof cpu !== 'string') return 0;
  
  const trimmed = cpu.trim();
  if (!trimmed) return 0;
  
  if (trimmed.endsWith('n')) {
    // nanocores to millicores
    const value = parseFloat(trimmed.slice(0, -1));
    return isNaN(value) ? 0 : value / 1000000;
  } else if (trimmed.endsWith('m')) {
    // millicores
    const value = parseFloat(trimmed.slice(0, -1));
    return isNaN(value) ? 0 : value;
  } else {
    // cores to millicores
    const value = parseFloat(trimmed);
    return isNaN(value) ? 0 : value * 1000;
  }
}

/**
 * Parse Memory value from Kubernetes format to MiB
 * Examples: "123Mi" -> 123, "456Ki" -> 0.445, "1Gi" -> 1024
 */
export function parseMemory(memory: string): number {
  if (!memory || typeof memory !== 'string') return 0;
  
  const trimmed = memory.trim();
  if (!trimmed) return 0;
  
  const units: { [key: string]: number } = {
    'Ki': 1 / 1024,      // KiB to MiB
    'Mi': 1,             // MiB
    'Gi': 1024,          // GiB to MiB
    'Ti': 1024 * 1024,   // TiB to MiB
    'K': 1 / 1024 / 1.024, // K to MiB
    'M': 1 / 1.024,        // M to MiB
    'G': 1024 / 1.024,     // G to MiB
    'T': 1024 * 1024 / 1.024 // T to MiB
  };
  
  for (const [unit, multiplier] of Object.entries(units)) {
    if (trimmed.endsWith(unit)) {
      const value = parseFloat(trimmed.slice(0, -unit.length));
      return isNaN(value) ? 0 : value * multiplier;
    }
  }
  
  // Plain bytes to MiB
  const value = parseFloat(trimmed);
  return isNaN(value) ? 0 : value / (1024 * 1024);
}

/**
 * Format CPU millicores to vCPU display
 * Always use vCPU for consistency
 */
export function formatCPU(millicores: number): string {
  if (!millicores || millicores === 0) return '0.00 vCPU';
  
  const vCPU = millicores / 1000;
  return `${vCPU.toFixed(2)} vCPU`;
}

/**
 * Format Memory MiB to display
 * Examples: 256 -> "256 MiB", 1536 -> "1.5 GiB"
 */
export function formatMemory(mib: number): string {
  if (!mib) return '0 MiB';
  
  if (mib >= 1024) {
    return `${(mib / 1024).toFixed(2)} GiB`;
  }
  return `${mib.toFixed(0)} MiB`;
}

/**
 * Parse pod metrics item to aggregated metrics
 */
export function parsePodMetrics(item: PodMetricsItem): ParsedMetrics {
  let totalCPU = 0;
  let totalMemory = 0;
  
  // Validate input
  if (!item || !item.containers || !Array.isArray(item.containers)) {
    return {
      cpu: 0,
      memory: 0,
      cpuDisplay: '0.00 vCPU',
      memoryDisplay: '0 MiB'
    };
  }
  
  // Sum all container metrics
  for (const container of item.containers) {
    if (container && container.usage) {
      totalCPU += parseCPU(container.usage.cpu);
      totalMemory += parseMemory(container.usage.memory);
    }
  }
  
  return {
    cpu: totalCPU,
    memory: totalMemory,
    cpuDisplay: formatCPU(totalCPU),
    memoryDisplay: formatMemory(totalMemory)
  };
}

/**
 * Fetch pod metrics from metrics.k8s.io API
 */
export async function fetchPodMetrics(
  axios: any,
  clusterId: string,
  namespace?: string
): Promise<Map<string, ParsedMetrics>> {
  const metricsMap = new Map<string, ParsedMetrics>();
  
  // Validate inputs
  if (!axios || !clusterId) {
    console.error('Invalid parameters for fetchPodMetrics');
    return metricsMap;
  }
  
  try {
    // Build API URL
    const baseUrl = `/k8s/clusters/${clusterId}/apis/metrics.k8s.io/v1beta1`;
    const url = namespace 
      ? `${baseUrl}/namespaces/${namespace}/pods`
      : `${baseUrl}/pods`;
    
    const response = await axios.get(url);
    const data = response.data as PodMetricsResponse;
    
    // Validate response structure
    if (data && data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        // Validate item has required metadata
        if (item.metadata && item.metadata.namespace && item.metadata.name) {
          const key = `${item.metadata.namespace}/${item.metadata.name}`;
          metricsMap.set(key, parsePodMetrics(item));
        }
      }
    }
  } catch (error: any) {
    // Log error but don't throw - return empty map to allow UI to handle gracefully
    const errorMessage = error.message || 'Unknown error';
    console.error('Failed to fetch pod metrics:', errorMessage);
  }
  
  return metricsMap;
}
