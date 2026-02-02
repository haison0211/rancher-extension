/**
 * Node Shell Types
 * 
 * Type definitions for Shell into Node feature
 */

export interface NodeShellPod {
  name: string;
  namespace: string;
  nodeName: string;
  status: 'creating' | 'pending' | 'running' | 'ready' | 'failed' | 'terminating';
  createdAt: Date;
  uid?: string;
}

export interface NodeShellSession {
  nodeId: string;
  podName: string;
  namespace: string;
  createdAt: Date;
  lastActiveAt: Date;
}

export const NODE_SHELL_CONFIG = {
  NAMESPACE: 'node-shell',
  POD_PREFIX: 'node-shell-',
  IMAGE: 'alpine:3.19',
  PRIORITY_CLASS: 'system-node-critical',
  SHELL_TIMEOUT: 1800000, // 30 minutes in milliseconds (pod auto-terminates)
  WAIT_TIMEOUT: 60000, // 60 seconds
  WAIT_INTERVAL: 1000, // 1 second
  CLEANUP_INTERVAL: 300000, // 5 minutes
  LABELS: {
    APP: 'node-shell',
    MANAGED_BY: 'rancher-node-filter-extension',
  },
  ANNOTATIONS: {
    NODE_NAME: 'rancher-node-filter.io/target-node',
    CREATED_AT: 'rancher-node-filter.io/created-at',
    EXPIRES_AT: 'rancher-node-filter.io/expires-at',
  }
};

export interface ShellPodOptions {
  nodeName: string;
  namespace?: string;
  podName?: string;
}

export interface ShellConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  message?: string;
  error?: Error;
}
