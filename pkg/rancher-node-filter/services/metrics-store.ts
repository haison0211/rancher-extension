/**
 * Shared, reactive metrics cache for pods, nodes and node disk usage.
 *
 * Why not the Rancher Vuex store:
 * - With the SQL cache (vai) enabled, steve serves metrics.k8s.io objects from its cache and they
 *   can be days old (see RANCHER-METRICS-CACHE-BUG.md), so metrics are read from the raw kube API.
 * - Writing partial sets of resources into the `cluster` store corrupts other pages.
 *
 * Polling rules (all feeds):
 * - poll only while something on screen subscribes AND the browser tab is visible
 * - single-flight (never two requests of the same feed in parallel)
 * - refresh immediately when a new subscriber needs data that is missing, otherwise keep the interval
 * - exponential backoff on errors, up to 5 minutes
 */

import { markRaw, reactive } from 'vue';
import { toMillicores, parseQuantity } from '../utils/quantity';
import { getPrometheusEndpoint } from '../utils/prometheus-config';

/** metrics-server resolution is 15-60s, the same cadence as Rancher's own metric poller */
export const METRICS_POLL_MS = 30000;
/** node_exporter is scraped every 30s+ and disk usage changes slowly */
export const DISK_POLL_MS = 60000;

const MAX_BACKOFF_MS = 300000;
const RELEASE_GRACE_MS = 5000;
const BATCH_DELAY_MS = 50;
/** Above this many namespaces one cluster-wide request is cheaper than N namespaced ones */
const NAMESPACE_SCOPE_LIMIT = 5;
/** Upper bound of namespaced requests when the cluster-wide list is forbidden */
const NAMESPACE_FALLBACK_LIMIT = 50;
const NAMESPACE_CONCURRENCY = 6;

/**
 * Data older than this many poll intervals is treated as missing (UI shows a spinner / N/A) instead of
 * being shown as current, e.g. when coming back to a page after several minutes.
 */
const MAX_AGE_INTERVALS = 2;

function isFresh(fetchedAt: number | undefined, intervalMs: number): boolean {
  return !!fetchedAt && Date.now() - fetchedAt <= intervalMs * MAX_AGE_INTERVALS;
}

const DISK_QUERY = 'max by (instance) ((1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100)';

export interface Usage {
  /** millicores */
  cpu: number;
  /** bytes */
  memory: number;
}

type Release = () => void;

function statusOf(err: any): number | undefined {
  return err?._status || err?.status || err?.response?.status;
}

function messageOf(err: any): string {
  return err?.message || err?.data?.message || err?._statusText || `${ err }`;
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

// ---------------------------------------------------------------------------
// Feed: generic polling lifecycle
// ---------------------------------------------------------------------------

const allFeeds: PollingFeed[] = [];
let visibilityListenerInstalled = false;

function installVisibilityListener(): void {
  if (visibilityListenerInstalled || typeof document === 'undefined') {
    return;
  }
  visibilityListenerInstalled = true;
  document.addEventListener('visibilitychange', () => allFeeds.forEach((feed) => feed.onVisibilityChange()));
}

class PollingFeed {
  private refs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private failures = 0;
  private lastAttempt = 0;
  private dirty = true;

  constructor(private readonly intervalMs: number, private readonly fetcher: () => Promise<void>) {
    allFeeds.push(this);
    installVisibilityListener();
  }

  acquire(): Release {
    let released = false;

    this.refs++;
    this.schedule();

    return () => {
      if (released) {
        return;
      }
      released = true;
      // Grace period: table cells are re-created on every table re-render
      setTimeout(() => {
        this.refs = Math.max(0, this.refs - 1);
        if (!this.refs) {
          this.clearTimer();
        }
      }, RELEASE_GRACE_MS);
    };
  }

  /** The set of things to fetch changed (new namespace, cluster switch, settings saved) */
  markDirty(): void {
    this.dirty = true;
    this.schedule();
  }

  resetBackoff(): void {
    this.failures = 0;
    this.markDirty();
  }

  onVisibilityChange(): void {
    if (isHidden()) {
      this.clearTimer();
    } else {
      this.schedule();
    }
  }

  /** Force a refresh now (manual refresh button) */
  refresh(): Promise<void> {
    this.dirty = true;

    return this.run();
  }

  private schedule(): void {
    if (!this.refs || isHidden()) {
      return;
    }

    const now = Date.now();
    let delay: number;

    if (this.failures) {
      delay = this.lastAttempt + Math.min(this.intervalMs * 2 ** this.failures, MAX_BACKOFF_MS) - now;
    } else if (this.dirty || !this.lastAttempt) {
      delay = 0;
    } else {
      delay = this.lastAttempt + this.intervalMs - now;
    }

    this.clearTimer();
    this.timer = setTimeout(() => this.tick(), Math.max(delay, BATCH_DELAY_MS));
  }

  private async tick(): Promise<void> {
    this.timer = null;
    if (!this.refs || isHidden()) {
      return;
    }
    await this.run();
    this.schedule();
  }

  private run(): Promise<void> {
    if (!this.inFlight) {
      this.lastAttempt = Date.now();
      this.dirty = false;
      this.inFlight = this.fetcher()
        .then(() => {
          this.failures = 0;
        })
        .catch(() => {
          this.failures++;
        })
        .finally(() => {
          this.inFlight = null;
        });
    }

    return this.inFlight;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------

let rancherStore: any = null;

function request(url: string): Promise<any> {
  return rancherStore.dispatch('cluster/request', { url });
}

function metricsBase(clusterId: string): string {
  return `/k8s/clusters/${ clusterId }/apis/metrics.k8s.io/v1beta1`;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;

      out[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return out;
}

function usageOfContainers(containers: any[] = []): Usage {
  return containers.reduce((acc: Usage, c: any) => {
    acc.cpu += toMillicores(c?.usage?.cpu);
    acc.memory += parseQuantity(c?.usage?.memory);

    return acc;
  }, { cpu: 0, memory: 0 });
}

// ---------------------------------------------------------------------------
// Pod metrics
// ---------------------------------------------------------------------------

export const podMetricsState = reactive({
  clusterId: '',
  /** namespace -> (pod name -> usage). Inner maps are raw and replaced wholesale */
  byNamespace: new Map<string, Map<string, Usage>>(),
  fetchedAt:   0,
  error:       '',
});

/** namespace -> subscriber count ('*' = every namespace the user can see) */
const podNamespaceRefs = new Map<string, number>();
/** namespace -> time its metrics were last fetched ('*' = last cluster-wide fetch) */
const podNamespaceFetchedAt = new Map<string, number>();
const forbiddenNamespaces = new Set<string>();
let clusterWideForbidden = false;

async function fetchNamespace(clusterId: string, namespace: string): Promise<any[] | null> {
  try {
    const res = await request(`${ metricsBase(clusterId) }/namespaces/${ encodeURIComponent(namespace) }/pods`);

    return res?.items || [];
  } catch (err) {
    if (statusOf(err) === 403) {
      forbiddenNamespaces.add(namespace);

      return null;
    }
    throw err;
  }
}

async function fetchPodMetrics(): Promise<void> {
  const clusterId = podMetricsState.clusterId;
  const wantAll = (podNamespaceRefs.get('*') || 0) > 0;
  const namespaces = [...podNamespaceRefs.entries()]
    .filter(([ns, count]) => ns !== '*' && count > 0)
    .map(([ns]) => ns);

  if (!clusterId || (!wantAll && !namespaces.length)) {
    return;
  }

  try {
    const grouped = new Map<string, Map<string, Usage>>();
    let fetchedNamespaces: string[] | null = null; // null = cluster-wide
    let items: any[] | null = null;

    if ((wantAll || namespaces.length > NAMESPACE_SCOPE_LIMIT) && !clusterWideForbidden) {
      try {
        items = (await request(`${ metricsBase(clusterId) }/pods`))?.items || [];
      } catch (err) {
        if (statusOf(err) !== 403) {
          throw err;
        }
        clusterWideForbidden = true;
      }
    }

    if (!items) {
      let targets = namespaces;

      if (wantAll) {
        // Namespaces allowed by the current header namespace filter
        const allowed = Object.keys(rancherStore.getters['activeNamespaceCache'] || {});

        targets = [...new Set([...namespaces, ...allowed])];
      }
      targets = targets.filter((ns) => !forbiddenNamespaces.has(ns)).slice(0, NAMESPACE_FALLBACK_LIMIT);

      const results = await mapWithConcurrency(targets, NAMESPACE_CONCURRENCY, (ns) => fetchNamespace(clusterId, ns));

      items = [];
      fetchedNamespaces = [];
      results.forEach((res, i) => {
        if (res) {
          fetchedNamespaces!.push(targets[i]);
          items!.push(...res);
        }
      });
    }

    if (clusterId !== podMetricsState.clusterId) {
      return; // cluster switched while fetching
    }

    items.forEach((item: any) => {
      const ns = item?.metadata?.namespace;
      const name = item?.metadata?.name;

      if (!ns || !name) {
        return;
      }
      if (!grouped.has(ns)) {
        grouped.set(ns, new Map());
      }
      grouped.get(ns)!.set(name, usageOfContainers(item.containers));
    });

    // Namespaces we asked for but that returned no pods: store an empty map so the UI shows "—", not a spinner
    const covered = fetchedNamespaces || [...new Set([...namespaces, ...podMetricsState.byNamespace.keys()])];

    covered.forEach((ns) => {
      if (!grouped.has(ns)) {
        grouped.set(ns, new Map());
      }
    });

    const now = Date.now();

    grouped.forEach((pods, ns) => {
      podMetricsState.byNamespace.set(ns, markRaw(pods));
      podNamespaceFetchedAt.set(ns, now);
    });
    if (!fetchedNamespaces) {
      podNamespaceFetchedAt.set('*', now);
    }
    podMetricsState.fetchedAt = now;
    podMetricsState.error = '';
  } catch (err) {
    podMetricsState.error = messageOf(err);
    throw err;
  }
}

const podFeed = new PollingFeed(METRICS_POLL_MS, fetchPodMetrics);

function switchPodCluster(clusterId: string): void {
  if (podMetricsState.clusterId === clusterId) {
    return;
  }
  podMetricsState.clusterId = clusterId;
  podMetricsState.byNamespace.clear();
  podNamespaceFetchedAt.clear();
  podMetricsState.fetchedAt = 0;
  podMetricsState.error = '';
  forbiddenNamespaces.clear();
  clusterWideForbidden = false;
  podFeed.markDirty();
}

/**
 * Keep pod metrics fresh for the given namespaces ('*' = all) while the returned release fn is not called
 */
export function subscribePodMetrics(store: any, clusterId: string, namespaces: string[] | '*'): Release {
  rancherStore = store;
  switchPodCluster(clusterId);

  const keys = namespaces === '*' ? ['*'] : [...new Set(namespaces.filter(Boolean))];
  let needsFetch = false;

  keys.forEach((ns) => {
    const count = podNamespaceRefs.get(ns) || 0;

    podNamespaceRefs.set(ns, count + 1);
    // Missing or older than one poll interval (e.g. cached from a page visited minutes ago): fetch now,
    // so old numbers are never shown as current
    if (Date.now() - (podNamespaceFetchedAt.get(ns) || 0) >= METRICS_POLL_MS) {
      needsFetch = true;
    }
  });

  if (needsFetch) {
    podFeed.markDirty();
  }

  const releaseFeed = podFeed.acquire();
  let released = false;

  return () => {
    if (released) {
      return;
    }
    released = true;
    keys.forEach((ns) => {
      const count = (podNamespaceRefs.get(ns) || 1) - 1;

      if (count > 0) {
        podNamespaceRefs.set(ns, count);
      } else {
        podNamespaceRefs.delete(ns);
      }
    });
    releaseFeed();
  };
}

function podNamespaceFresh(namespace: string): boolean {
  // Reading podMetricsState.fetchedAt makes callers re-evaluate after every fetch
  return !!podMetricsState.fetchedAt && isFresh(podNamespaceFetchedAt.get(namespace), METRICS_POLL_MS);
}

export function podUsage(namespace: string, name: string): Usage | undefined {
  const pods = podMetricsState.byNamespace.get(namespace);

  return pods && podNamespaceFresh(namespace) ? pods.get(name) : undefined;
}

/** Fresh metrics for this namespace have been received (possibly with no entry for a given pod) */
export function podNamespaceLoaded(namespace: string): boolean {
  return podMetricsState.byNamespace.has(namespace) && podNamespaceFresh(namespace);
}

export function isPodNamespaceForbidden(namespace: string): boolean {
  return forbiddenNamespaces.has(namespace);
}

export function listPodUsage(includeNamespace: (ns: string) => boolean): Array<Usage & { namespace: string; name: string }> {
  const out: Array<Usage & { namespace: string; name: string }> = [];

  podMetricsState.byNamespace.forEach((pods, namespace) => {
    if (!includeNamespace(namespace) || !podNamespaceFresh(namespace)) {
      return;
    }
    pods.forEach((usage, name) => out.push({
      namespace, name, cpu: usage.cpu, memory: usage.memory
    }));
  });

  return out;
}

export function refreshPodMetrics(): Promise<void> {
  return podFeed.refresh();
}

// ---------------------------------------------------------------------------
// Node metrics
// ---------------------------------------------------------------------------

export const nodeMetricsState = reactive({
  clusterId: '',
  usage:     markRaw(new Map<string, Usage>()),
  fetchedAt: 0,
  error:     '',
});

async function fetchNodeMetrics(): Promise<void> {
  const clusterId = nodeMetricsState.clusterId;

  if (!clusterId) {
    return;
  }

  try {
    const res = await request(`${ metricsBase(clusterId) }/nodes`);
    const usage = new Map<string, Usage>();

    (res?.items || []).forEach((item: any) => {
      if (item?.metadata?.name) {
        usage.set(item.metadata.name, {
          cpu:    toMillicores(item.usage?.cpu),
          memory: parseQuantity(item.usage?.memory),
        });
      }
    });

    if (clusterId !== nodeMetricsState.clusterId) {
      return;
    }
    nodeMetricsState.usage = markRaw(usage);
    nodeMetricsState.fetchedAt = Date.now();
    nodeMetricsState.error = '';
  } catch (err) {
    nodeMetricsState.error = messageOf(err);
    throw err;
  }
}

const nodeFeed = new PollingFeed(METRICS_POLL_MS, fetchNodeMetrics);

export function subscribeNodeMetrics(store: any, clusterId: string): Release {
  rancherStore = store;
  if (nodeMetricsState.clusterId !== clusterId) {
    nodeMetricsState.clusterId = clusterId;
    nodeMetricsState.usage = markRaw(new Map());
    nodeMetricsState.fetchedAt = 0;
    nodeMetricsState.error = '';
    nodeFeed.markDirty();
  }

  return nodeFeed.acquire();
}

export function nodeUsage(nodeName: string): Usage | undefined {
  return isFresh(nodeMetricsState.fetchedAt, METRICS_POLL_MS) ? nodeMetricsState.usage.get(nodeName) : undefined;
}

// ---------------------------------------------------------------------------
// Node disk usage (Prometheus / node_exporter)
// ---------------------------------------------------------------------------

export type DiskStatus = 'unknown' | 'ok' | 'forbidden' | 'unavailable' | 'not-configured';

export const diskMetricsState = reactive({
  clusterId: '',
  /** node internal IP -> used % of the root filesystem */
  byIp:      markRaw(new Map<string, number>()),
  fetchedAt: 0,
  status:    'unknown' as DiskStatus,
  error:     '',
});

async function fetchDiskMetrics(): Promise<void> {
  const clusterId = diskMetricsState.clusterId;

  // 403 is permanent for this session (until the endpoint is changed): stop asking
  if (!clusterId || diskMetricsState.status === 'forbidden') {
    return;
  }

  const endpoint = getPrometheusEndpoint();

  if (!endpoint) {
    diskMetricsState.status = 'not-configured';

    return;
  }

  try {
    const res = await request(`/k8s/clusters/${ clusterId }/api/v1/namespaces/${ endpoint }/proxy/api/v1/query?query=${ encodeURIComponent(DISK_QUERY) }`);
    const byIp = new Map<string, number>();

    (res?.data?.result || []).forEach((item: any) => {
      const ip = `${ item?.metric?.instance || '' }`.split(':')[0];
      const value = parseFloat(item?.value?.[1]);

      if (ip && !isNaN(value)) {
        byIp.set(ip, value);
      }
    });

    if (clusterId !== diskMetricsState.clusterId) {
      return;
    }
    diskMetricsState.byIp = markRaw(byIp);
    diskMetricsState.fetchedAt = Date.now();
    diskMetricsState.status = 'ok';
    diskMetricsState.error = '';
  } catch (err) {
    if (statusOf(err) === 403) {
      diskMetricsState.status = 'forbidden';

      return;
    }
    diskMetricsState.status = 'unavailable';
    diskMetricsState.error = messageOf(err);
    throw err;
  }
}

const diskFeed = new PollingFeed(DISK_POLL_MS, fetchDiskMetrics);

export function subscribeDiskMetrics(store: any, clusterId: string): Release {
  rancherStore = store;
  if (diskMetricsState.clusterId !== clusterId) {
    diskMetricsState.clusterId = clusterId;
    diskMetricsState.byIp = markRaw(new Map());
    diskMetricsState.fetchedAt = 0;
    diskMetricsState.status = 'unknown';
    diskMetricsState.error = '';
    diskFeed.markDirty();
  }

  return diskFeed.acquire();
}

export function diskUsageByIp(ip: string | undefined): number | undefined {
  return ip && isFresh(diskMetricsState.fetchedAt, DISK_POLL_MS) ? diskMetricsState.byIp.get(ip) : undefined;
}

/** Call after the Prometheus endpoint setting changes */
export function resetDiskMetrics(): void {
  diskMetricsState.byIp = markRaw(new Map());
  diskMetricsState.fetchedAt = 0;
  diskMetricsState.status = 'unknown';
  diskMetricsState.error = '';
  diskFeed.resetBackoff();
}
