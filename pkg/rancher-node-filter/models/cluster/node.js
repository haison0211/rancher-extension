/**
 * Custom Node Model - Synchronized Metrics
 * 
 * This model extends the default ClusterNode to fix metrics calculation
 * discrepancies between Node List and Node Detail views.
 * 
 * PROBLEM:
 * - Node List: Uses pod requests (for EKS Norman) + capacity for RAM
 * - Node Detail: Uses actual usage from metrics-server + allocatable for RAM
 * - This causes ~40% difference in displayed CPU/RAM percentages
 * 
 * SOLUTION:
 * - Always use actual usage from metrics-server (consistent with kubectl top nodes)
 * - Always use allocatable (not capacity) for both CPU and RAM denominators
 * - This matches Node Detail behavior and is more accurate
 * 
 * @see dashboard-master/shell/models/cluster/node.js (original)
 * @see dashboard-master/shell/detail/node.vue (Node Detail - correct behavior)
 */

import ClusterNode from '@shell/models/cluster/node';
import { METRIC } from '@shell/config/types';
import { parseSi } from '@shell/utils/units';
import { getPrometheusEndpoint } from '../../utils/prometheus-config.js';

// Global cache for direct API metrics (25 second TTL)
let metricsCache = null;
let metricsCacheTime = 0;
const CACHE_TTL = 25000; // 25 seconds

// Global cache for Prometheus endpoint detection (5 minutes TTL)
let prometheusEndpoint = null;
let prometheusDetectionTime = 0;
const PROMETHEUS_CACHE_TTL = 300000; // 5 minutes

// Global cache for disk metrics (25 second TTL, same as CPU/RAM)
let diskMetricsCache = null;
let diskMetricsCacheTime = 0;

export default class SyncedMetricsNode extends ClusterNode {
  /**
   * Fetch fresh metrics directly from Kubernetes API
   * Bypasses Rancher store which has caching issues in v2.13.1
   * 
   * Caching Strategy:
   * - Fetches ALL node metrics in one API call (efficient)
   * - Caches for 25s (faster refresh, more API calls)
   * - All nodes share the same cache (no redundant API calls)
   * 
   * @returns {Promise<Object|null>} Metrics object for this node or null
   */
  async _fetchDirectMetrics() {
    const now = Date.now();
    
    // Return cached data if still fresh (prevents API spam)
    if (metricsCache && (now - metricsCacheTime) < CACHE_TTL) {
      return metricsCache.find(m => m.metadata.name === this.metadata.name);
    }
    
    try {
      // Query directly from K8s API (bypasses Rancher store cache bug)
      const response = await fetch('/k8s/clusters/local/apis/metrics.k8s.io/v1beta1/nodes', {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        console.warn('[SyncedMetricsNode] Failed to fetch metrics:', response.status);
        return null;
      }
      
      const data = await response.json();
      
      // Update global cache (shared across all node instances)
      metricsCache = data.items || [];
      metricsCacheTime = now;
      
      return metricsCache.find(m => m.metadata.name === this.metadata.name);
    } catch (error) {
      console.error('[SyncedMetricsNode] Error fetching metrics:', error);
      return null;
    }
  }

  /**
   * Get metrics with fallback strategy:
   * 1. Try cached direct API (fresh within 15s)
   * 2. Fallback to Rancher store (may be stale)
   * 
   * @returns {Object|null} Metrics usage object
   */
  _getMetricsUsage() {
    // Check if we have cached direct metrics (already validated in _fetchDirectMetrics)
    if (metricsCache && (Date.now() - metricsCacheTime) < CACHE_TTL) {
      const directMetrics = metricsCache.find(m => m.metadata.name === this.metadata.name);
      if (directMetrics?.usage) {
        return directMetrics.usage;
      }
    }
    
    // Fallback to Rancher store (may be stale due to cache bug)
    const nodeMetrics = this.$rootGetters['cluster/byId'](METRIC.NODE, this.id);
    if (nodeMetrics?.usage) {
      return nodeMetrics.usage;
    }
    
    return null;
  }

  /**
   * Auto-detect or use configured Prometheus endpoint
   * Caches endpoint for 5 minutes to avoid repeated detection
   * 
   * @returns {Promise<string|null>} Prometheus API path or null if not available
   */
  async _getPrometheusEndpoint() {
    const now = Date.now();
    
    // Return cached endpoint if still valid
    if (prometheusEndpoint && (now - prometheusDetectionTime) < PROMETHEUS_CACHE_TTL) {
      return prometheusEndpoint;
    }
    
    try {
      // Get configured endpoint from localStorage
      const configuredEndpoint = getPrometheusEndpoint();
      
      if (!configuredEndpoint) {
        return null;
      }
      
      // Build full API path: /api/v1/namespaces/{namespace}/services/{service}/proxy
      const fullPath = `/api/v1/namespaces/${configuredEndpoint}/proxy`;
      const testUrl = `/k8s/clusters/local${fullPath}/api/v1/query?query=up&timeout=5s`;
      
      // Test if endpoint is accessible with a simple query
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Cache successful endpoint
        prometheusEndpoint = fullPath;
        prometheusDetectionTime = now;
        return fullPath;
      } else {
        console.warn(`[SyncedMetricsNode] Prometheus endpoint not accessible: ${response.status}`);
        return null;
      }
    } catch (error) {
      // Only warn on first failure (avoid spam)
      if (!prometheusEndpoint) {
        console.warn('[SyncedMetricsNode] Prometheus not available:', error.message);
      }
      return null;
    }
  }

  /**
   * Fetch disk usage metrics from Prometheus for ALL nodes
   * Queries once and caches results for all nodes (efficient)
   * 
   * Query: (1 - node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100
   * Returns percentage of disk used on root filesystem
   * 
   * @returns {Promise<Object|null>} Map of instance -> disk percentage, or null if unavailable
   */
  async _fetchDiskMetrics() {
    const now = Date.now();
    
    // Return cached data if still fresh
    if (diskMetricsCache && (now - diskMetricsCacheTime) < CACHE_TTL) {
      return diskMetricsCache;
    }
    
    try {
      const endpoint = await this._getPrometheusEndpoint();
      if (!endpoint) {
        return null; // Prometheus not available
      }
      
      // Query disk usage for ALL nodes at once (efficient!)
      // Formula: (1 - available/size) * 100 = used percentage
      // Filter by mountpoint="/" to get root filesystem only
      const query = `(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100`;
      
      const queryUrl = `/k8s/clusters/local${endpoint}/api/v1/query?query=${encodeURIComponent(query)}&timeout=10s`;
      
      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      if (!response.ok) {
        console.warn(`[SyncedMetricsNode] Prometheus query failed: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      
      // Check for valid response structure
      if (!data.data || !data.data.result || !Array.isArray(data.data.result)) {
        console.warn('[SyncedMetricsNode] Invalid Prometheus response structure');
        return null;
      }
      
      // Parse results into map: { "node-ip:port": diskPercentage }
      const metricsMap = {};
      data.data.result.forEach((item) => {
        try {
          const instance = item.metric?.instance; // e.g., "172.29.14.12:9100"
          const diskPercent = parseFloat(item.value?.[1]);
          
          if (instance && !isNaN(diskPercent)) {
            metricsMap[instance] = diskPercent;
          }
        } catch (error) {
          // Skip invalid items silently
        }
      });
      
      // Update global cache (shared across all node instances)
      diskMetricsCache = metricsMap;
      diskMetricsCacheTime = now;
      
      return metricsMap;
      
    } catch (error) {
      // Only log errors that aren't timeouts or network issues
      if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
        console.error('[SyncedMetricsNode] Error fetching disk metrics:', error);
      }
      return null;
    }
  }

  /**
   * Get disk usage percentage for this specific node
   * Matches node by internal IP address
   * 
   * @returns {Promise<number|null>} Disk usage percentage (0-100) or null if unavailable
   */
  async getDiskUsage() {
    try {
      const metricsMap = await this._fetchDiskMetrics();
      if (!metricsMap) {
        return null;
      }
      
      // Get node's internal IP
      const nodeIp = this.internalIp;
      if (!nodeIp) {
        return null;
      }
      
      // Match by IP address (ignore port number since it varies: 9100, 9796, etc.)
      // Find the first instance key that starts with the node's IP
      let diskPercent = null;
      for (const [instanceKey, value] of Object.entries(metricsMap)) {
        // Extract IP from instance key (format: "IP:port" or just "IP")
        const instanceIp = instanceKey.split(':')[0];
        if (instanceIp === nodeIp) {
          diskPercent = value;
          break;
        }
      }
      
      if (diskPercent !== undefined && !isNaN(diskPercent)) {
        return diskPercent;
      }
      
      return null;
    } catch (error) {
      console.error(`[SyncedMetricsNode] Error getting disk usage for ${this.nameDisplay}:`, error);
      return null;
    }
  }

  /**
   * 🔍 DEBUG HELPER - Test Prometheus connection and disk metrics
   * 
   * Usage in browser console:
   *   const node = $nuxt.$store.getters['cluster/all']('node')[0];
   *   await node.debugDiskMetrics();
   * 
   * @returns {Promise<Object>} Debug information
   */
  async debugDiskMetrics() {
    console.log('\n🔍 === DISK METRICS DEBUG ===\n');
    
    const debug = {
      nodeInfo: {
        name: this.nameDisplay,
        internalIp: this.internalIp,
        id: this.id
      },
      prometheusTest: null,
      diskQueryTest: null,
      cacheState: null,
      recommendation: null
    };
    
    try {
      // Test 1: Prometheus Endpoint
      console.log('1️⃣ Testing Prometheus endpoint...');
      const endpoint = await this._getPrometheusEndpoint();
      
      if (!endpoint) {
        debug.prometheusTest = { success: false, error: 'Endpoint detection failed' };
        debug.recommendation = 'Check Prometheus endpoint in Settings. Default: ops/services/ops-prometheus-server:80';
        console.error('❌ Prometheus endpoint not accessible');
        console.log(debug);
        return debug;
      }
      
      debug.prometheusTest = { success: true, endpoint };
      console.log(`✅ Prometheus endpoint: ${endpoint}`);
      
      // Test 2: Disk Query
      console.log('\n2️⃣ Testing disk metrics query...');
      const metricsMap = await this._fetchDiskMetrics();
      
      if (!metricsMap) {
        debug.diskQueryTest = { success: false, error: 'Query returned null' };
        debug.recommendation = 'Prometheus query failed. Check if node-exporter is installed.';
        console.error('❌ Disk query failed');
        console.log(debug);
        return debug;
      }
      
      const resultCount = Object.keys(metricsMap).length;
      debug.diskQueryTest = { 
        success: true, 
        resultCount,
        allInstances: Object.keys(metricsMap)
      };
      console.log(`✅ Query successful! Found ${resultCount} nodes with disk metrics`);
      console.log('Available instances:', Object.keys(metricsMap));
      
      // Test 3: Match This Node
      console.log('\n3️⃣ Matching this node...');
      const instanceKey = `${this.internalIp}:9796`;
      const diskPercent = metricsMap[instanceKey] || metricsMap[this.internalIp];
      
      if (diskPercent !== undefined && !isNaN(diskPercent)) {
        debug.cacheState = {
          matched: true,
          instanceKey,
          diskPercent: diskPercent.toFixed(1) + '%',
          currentCache: this._diskUsageCache
        };
        console.log(`✅ Node matched! Disk usage: ${diskPercent.toFixed(1)}%`);
      } else {
        debug.cacheState = {
          matched: false,
          searchedKeys: [instanceKey, this.internalIp],
          availableKeys: Object.keys(metricsMap).slice(0, 5)
        };
        debug.recommendation = `Node IP "${this.internalIp}" not found in Prometheus results. Check node-exporter labels.`;
        console.error(`❌ No match found for ${this.internalIp}`);
        console.log('Tried keys:', [instanceKey, this.internalIp]);
        console.log('Available keys (first 5):', Object.keys(metricsMap).slice(0, 5));
      }
      
    } catch (error) {
      debug.error = error.message;
      debug.recommendation = 'Unexpected error. Check console for details.';
      console.error('❌ Debug error:', error);
    }
    
    console.log('\n📊 Debug Summary:');
    console.table(debug);
    console.log('\n=== END DEBUG ===\n');
    
    return debug;
  }

  /**
   * CPU Usage - Always use actual usage from metrics-server
   * 
   * WORKAROUND for Rancher v2.13.1 metrics cache bug:
   * - Rancher store caches metrics for 20+ days
   * - Direct K8s API returns fresh data
   * - Fallback to store then pod requests
   * 
   * @returns {number} CPU usage in nanocores (parseSi format)
   */
  get cpuUsage() {
    // Try to get metrics (cached direct API or Rancher store)
    const usage = this._getMetricsUsage();
    
    if (usage?.cpu) {
      return parseSi(usage.cpu);
    }
    
    // Fallback to pod requests if metrics-server is not available
    if (this.podRequests?.cpu) {
      return parseSi(this.podRequests.cpu);
    }
    
    return 0;
  }

  /**
   * CPU Capacity - Use allocatable (unchanged, already correct)
   * 
   * @returns {number} CPU capacity in nanocores
   */
  get cpuCapacity() {
    return parseSi(this.status?.allocatable?.cpu || '0');
  }

  /**
   * CPU Usage Percentage - Consistent calculation
   * 
   * Formula: (actual usage / allocatable) × 100
   * Same as Node Detail ConsumptionGauge
   * 
   * @returns {string} CPU usage percentage
   */
  get cpuUsagePercentage() {
    const usage = this.cpuUsage;
    const capacity = this.cpuCapacity;
    
    if (!capacity || capacity === 0) {
      return '0';
    }
    
    return ((usage * 100) / capacity).toString();
  }

  /**
   * RAM Usage - Always use actual usage from metrics-server
   * 
   * WORKAROUND for Rancher v2.13.1 metrics cache bug:
   * - Uses same direct API strategy as cpuUsage
   * 
   * @returns {number} RAM usage in bytes (parseSi format)
   */
  get ramUsage() {
    // Try to get metrics (cached direct API or Rancher store)
    const usage = this._getMetricsUsage();
    
    if (usage?.memory) {
      return parseSi(usage.memory);
    }
    
    // Fallback to pod requests if metrics-server is not available
    if (this.podRequests?.memory) {
      return parseSi(this.podRequests.memory);
    }
    
    return 0;
  }

  /**
   * RAM Capacity - Use ALLOCATABLE instead of capacity
   * 
   * Original (buggy) behavior:
   *   return parseSi(this.status.capacity?.memory);  // ← Uses total capacity (wrong)
   * 
   * Fixed behavior:
   *   Use allocatable (same as Node Detail's ramReserved)
   *   This accounts for system reserved memory
   * 
   * Note: This is different from ramReserved which is already defined
   * We're fixing ramCapacity to be consistent with Node Detail
   * 
   * @returns {number} RAM capacity (allocatable) in bytes
   */
  get ramCapacity() {
    // Use allocatable instead of capacity for consistency with Node Detail
    return parseSi(this.status?.allocatable?.memory || '0');
  }

  /**
   * RAM Usage Percentage - Consistent calculation
   * 
   * Formula: (actual usage / allocatable) × 100
   * Same as Node Detail ConsumptionGauge (which uses ramReserved)
   * 
   * Original (buggy) behavior used:
   *   (ramUsage / capacity) × 100  // ← Wrong denominator
   * 
   * Fixed behavior:
   *   (ramUsage / allocatable) × 100  // ← Same as Node Detail
   * 
   * @returns {string} RAM usage percentage
   */
  get ramUsagePercentage() {
    const usage = this.ramUsage;
    const capacity = this.ramCapacity; // Now uses allocatable
    
    if (!capacity || capacity === 0) {
      return '0';
    }
    
    return ((usage * 100) / capacity).toString();
  }

  /**
   * RAM Reserved - Already correct in original, keeping for reference
   * This is what Node Detail uses for capacity
   * 
   * @returns {number} RAM allocatable in bytes
   */
  get ramReserved() {
    return parseSi(this.status?.allocatable?.memory || '0');
  }

  /**
   * RAM Reserved Percentage - For compatibility
   * Same as ramUsagePercentage now that we use allocatable
   * 
   * @returns {string} RAM usage percentage against allocatable
   */
  get ramReservedPercentage() {
    return this.ramUsagePercentage;
  }

  /**
   * Helper: Check if node metrics are available from metrics-server
   * Useful for UI to show loading/unavailable states
   * 
   * @returns {boolean} True if metrics-server data is available
   */
  get hasMetricsData() {
    const usage = this._getMetricsUsage();
    return !!(usage?.cpu && usage?.memory);
  }

  /**
   * Initialize metrics fetch
   * Call this when component mounts to start fetching fresh metrics
   * 
   * @returns {Promise<void>}
   */
  async initMetrics() {
    await this._fetchDirectMetrics();
  }

  /**
   * Helper: Get formatted CPU usage for display
   * Returns human-readable format like "2.1 cores" or "500m"
   * 
   * @returns {string} Formatted CPU usage
   */
  get cpuUsageFormatted() {
    const usage = this.cpuUsage;
    if (usage >= 1000000000) {
      // Convert nanocores to cores
      return `${(usage / 1000000000).toFixed(2)} cores`;
    }
    // Convert nanocores to millicores
    return `${Math.round(usage / 1000000)}m`;
  }

  /**
   * Helper: Get formatted RAM usage for display
   * Returns human-readable format like "8.5 GiB" or "512 MiB"
   * 
   * @returns {string} Formatted RAM usage
   */
  get ramUsageFormatted() {
    const usage = this.ramUsage;
    const GiB = 1024 * 1024 * 1024;
    const MiB = 1024 * 1024;
    
    if (usage >= GiB) {
      return `${(usage / GiB).toFixed(2)} GiB`;
    }
    return `${Math.round(usage / MiB)} MiB`;
  }

  /**
   * Disk Usage Percentage - From Prometheus (optional)
   * 
   * This is populated by loadMetrics() in the list component
   * Returns string percentage for PercentageBar component compatibility
   * 
   * @returns {string|null} Disk usage percentage as string (e.g., "45.2") or null
   */
  get diskUsagePercentage() {
    // This value is set by the list component after calling getDiskUsage()
    const cached = this._diskUsageCache;
    if (cached === null || cached === undefined) {
      return null;
    }
    // Convert to string with 1 decimal place to match PercentageBar expected format
    return cached.toFixed(1);
  }

  /**
   * Helper: Get formatted disk usage for display
   * Returns human-readable format like "45.2%" or "N/A"
   * 
   * @returns {string} Formatted disk usage
   */
  get diskUsageFormatted() {
    const usage = this.diskUsagePercentage;
    if (usage === null || usage === undefined) {
      return 'N/A';
    }
    // diskUsagePercentage is already a string like "45.2"
    return `${usage}%`;
  }

  /**
   * 🔍 DEBUG HELPER - Comprehensive metrics diagnostic
   * 
   * Usage in browser console:
   *   const node = $nuxt.$store.getters['cluster/all']('node')[0];
   *   console.log(node.debugMetrics());
   * 
   * @returns {object} Detailed metrics information for debugging
   */
  debugMetrics() {
    const nodeMetrics = this.$rootGetters['cluster/byId'](METRIC.NODE, this.id);
    
    const debug = {
      '🏷️ Model Info': {
        'Class Name': this.constructor.name,
        'Node ID': this.id,
        'Node Name': this.metadata?.name,
        'Is Extension Model': this.constructor.name === 'SyncedMetricsNode'
      },
      
      '📊 Raw Data Sources': {
        'status.capacity.memory': this.status?.capacity?.memory,
        'status.allocatable.memory': this.status?.allocatable?.memory,
        'metrics.usage.memory': nodeMetrics?.usage?.memory,
        'metrics.usage.cpu': nodeMetrics?.usage?.cpu,
        'podRequests.memory': this.podRequests?.memory,
        'podRequests.cpu': this.podRequests?.cpu
      },
      
      '🔢 Parsed Values (parseSi)': {
        'ramUsage (getter)': this.ramUsage,
        'ramCapacity (getter)': this.ramCapacity,
        'ramReserved (getter)': this.ramReserved,
        'cpuUsage (getter)': this.cpuUsage,
        'cpuCapacity (getter)': this.cpuCapacity
      },
      
      '✅ Validation Checks': {
        '1️⃣ Extension Model Loaded': this.constructor.name === 'SyncedMetricsNode',
        '2️⃣ ramCapacity === ramReserved': this.ramCapacity === this.ramReserved,
        '3️⃣ Has Metrics Data': this.hasMetricsData,
        '4️⃣ Using Metrics (not podRequests)': !!nodeMetrics?.usage?.memory,
        '5️⃣ ramUsagePercentage === ramReservedPercentage': this.ramUsagePercentage === this.ramReservedPercentage
      },
      
      '📈 Percentage Calculations': {
        'ramUsagePercentage (getter)': this.ramUsagePercentage,
        'ramReservedPercentage (getter)': this.ramReservedPercentage,
        'cpuUsagePercentage (getter)': this.cpuUsagePercentage,
        'Manual RAM % Calc': this.ramUsage && this.ramCapacity 
          ? ((this.ramUsage * 100) / this.ramCapacity).toString() 
          : 'N/A',
        'Manual CPU % Calc': this.cpuUsage && this.cpuCapacity
          ? ((this.cpuUsage * 100) / this.cpuCapacity).toString()
          : 'N/A'
      },
      
      '🎯 Node Detail Comparison': {
        'ConsumptionGauge uses': {
          'CPU capacity': 'value.cpuCapacity',
          'CPU used': 'value.cpuUsage',
          'RAM capacity': 'value.ramReserved',
          'RAM used': 'value.ramUsage'
        },
        'Expected RAM % (Node Detail)': this.ramUsage && this.ramReserved
          ? ((this.ramUsage * 100) / this.ramReserved).toString()
          : 'N/A',
        'Difference (if any)': this.ramUsagePercentage && this.ramReserved
          ? (parseFloat(this.ramUsagePercentage) - ((this.ramUsage * 100) / this.ramReserved)).toFixed(4)
          : 'N/A'
      },
      
      '⚠️ Potential Issues': this._detectIssues()
    };
    
    return debug;
  }

  /**
   * Internal helper to detect common issues
   * @private
   */
  _detectIssues() {
    const issues = [];
    const nodeMetrics = this.$rootGetters['cluster/byId'](METRIC.NODE, this.id);
    
    // Check 1: Model not loaded
    if (this.constructor.name !== 'SyncedMetricsNode') {
      issues.push('❌ Extension model NOT loaded! Using default ClusterNode.');
    }
    
    // Check 2: ramCapacity != ramReserved
    if (this.ramCapacity !== this.ramReserved) {
      issues.push(`❌ ramCapacity (${this.ramCapacity}) != ramReserved (${this.ramReserved})`);
    }
    
    // Check 3: No metrics data
    if (!nodeMetrics?.usage?.memory || !nodeMetrics?.usage?.cpu) {
      issues.push('⚠️ Metrics-server data NOT available! Using fallback (podRequests).');
    }
    
    // Check 4: Percentage mismatch
    if (this.ramUsagePercentage !== this.ramReservedPercentage) {
      issues.push(`❌ ramUsagePercentage (${this.ramUsagePercentage}) != ramReservedPercentage (${this.ramReservedPercentage})`);
    }
    
    // Check 5: Manual calc mismatch
    const manualCalc = this.ramUsage && this.ramCapacity 
      ? ((this.ramUsage * 100) / this.ramCapacity).toString()
      : null;
    
    if (manualCalc && manualCalc !== this.ramUsagePercentage) {
      const diff = Math.abs(parseFloat(this.ramUsagePercentage) - parseFloat(manualCalc));
      if (diff > 0.01) {
        issues.push(`⚠️ Manual calculation differs by ${diff.toFixed(4)}%`);
      }
    }
    
    // Check 6: Using capacity instead of allocatable (shouldn't happen with extension)
    if (this.ramCapacity === parseSi(this.status?.capacity?.memory)) {
      issues.push('❌ ramCapacity is using capacity (should use allocatable)!');
    }
    
    if (issues.length === 0) {
      return ['✅ No issues detected! Extension working correctly.'];
    }
    
    return issues;
  }

  /**
   * 🔍 DEBUG HELPER - Quick console log of key metrics
   * 
   * Usage: node.logDebug()
   */
  logDebug() {
    console.group(`🔍 Node Metrics Debug: ${this.metadata?.name || this.id}`);
    
    const debug = this.debugMetrics();
    
    Object.entries(debug).forEach(([section, data]) => {
      console.group(section);
      console.table(data);
      console.groupEnd();
    });
    
    console.groupEnd();
  }

  /**
   * 🔍 DEBUG HELPER - Compare with another node or expected values
   * 
   * Usage: 
   *   const node1 = nodes[0];
   *   const node2 = nodes[1];
   *   console.log(node1.compareMetrics(node2));
   */
  compareMetrics(other) {
    if (!other) {
      return 'No comparison node provided';
    }
    
    return {
      'Node 1': this.metadata?.name || this.id,
      'Node 2': other.metadata?.name || other.id,
      'Comparison': {
        'Both using Extension': {
          'Node 1': this.constructor.name === 'SyncedMetricsNode',
          'Node 2': other.constructor.name === 'SyncedMetricsNode'
        },
        'RAM Usage Match': {
          'Node 1 ramUsage': this.ramUsage,
          'Node 2 ramUsage': other.ramUsage,
          'Match': this.ramUsage === other.ramUsage
        },
        'RAM Capacity Match': {
          'Node 1 ramCapacity': this.ramCapacity,
          'Node 2 ramCapacity': other.ramCapacity,
          'Match': this.ramCapacity === other.ramCapacity
        },
        'Percentage Match': {
          'Node 1 RAM %': this.ramUsagePercentage,
          'Node 2 RAM %': other.ramUsagePercentage,
          'Difference': Math.abs(parseFloat(this.ramUsagePercentage) - parseFloat(other.ramUsagePercentage)).toFixed(4)
        }
      }
    };
  }
}
