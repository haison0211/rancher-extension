/**
 * Pod Metrics Type Definitions
 * Based on metrics.k8s.io/v1beta1 API
 */

export interface PodMetricsContainer {
  name: string;
  usage: {
    cpu: string;      // Format: "123m" or "1234n"
    memory: string;   // Format: "123Mi" or "456Ki"
  };
}

export interface PodMetricsItem {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  timestamp: string;
  window: string;
  containers: PodMetricsContainer[];
}

export interface PodMetricsResponse {
  kind: string;
  apiVersion: string;
  metadata: {
    selfLink?: string;
  };
  items: PodMetricsItem[];
}

export interface ParsedMetrics {
  cpu: number;          // in millicores
  memory: number;       // in MiB
  cpuDisplay: string;   // formatted for display (e.g., "0.5 vCPU")
  memoryDisplay: string; // formatted for display (e.g., "256 MiB")
}
