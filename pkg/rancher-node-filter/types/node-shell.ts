/**
 * Node Shell Types
 *
 * Type definitions for Shell into Node feature
 */

export const NODE_SHELL_CONFIG = {
  NAMESPACE:                'node-shell',
  POD_PREFIX:               'node-shell-',
  IMAGE:                    'alpine:3.19',
  PRIORITY_CLASS:           'system-node-critical',
  // Kubernetes kills the pod after this long, even if the browser never cleans it up
  ACTIVE_DEADLINE_SECONDS:  1800,
  // Shell pods older than this (or already finished) are deleted the next time someone opens a shell
  MAX_AGE_MS:               30 * 60 * 1000,
  WAIT_TIMEOUT_MS:          60000,
  WAIT_INITIAL_INTERVAL_MS: 500,
  WAIT_MAX_INTERVAL_MS:     2000,
  LABELS:                   {
    APP:        'node-shell',
    MANAGED_BY: 'rancher-node-filter-extension',
  },
  ANNOTATIONS: {
    NODE_NAME:  'rancher-node-filter.io/target-node',
    CREATED_AT: 'rancher-node-filter.io/created-at',
  }
};
