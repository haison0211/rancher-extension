/**
 * Kubernetes resource.Quantity parsing / formatting (no @shell imports so it stays tiny)
 */

const SUFFIX_MULTIPLIERS: Record<string, number> = {
  n:  1e-9,
  u:  1e-6,
  m:  1e-3,
  '': 1,
  k:  1e3,
  M:  1e6,
  G:  1e9,
  T:  1e12,
  P:  1e15,
  E:  1e18,
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
};

const QUANTITY_RE = /^([+-]?[0-9.]+(?:[eE][+-]?[0-9]+)?)(n|u|m|k|M|G|T|P|E|Ki|Mi|Gi|Ti|Pi|Ei)?$/;

/**
 * Parse a Kubernetes quantity ("250m", "123456n", "512Mi", "2") into base units (cores / bytes)
 */
export function parseQuantity(value: string | number | undefined | null): number {
  if (value === undefined || value === null) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  const match = QUANTITY_RE.exec(value.trim());

  if (!match) {
    return 0;
  }

  const n = parseFloat(match[1]);

  return isNaN(n) ? 0 : n * SUFFIX_MULTIPLIERS[match[2] || ''];
}

/** CPU cores -> millicores */
export function toMillicores(value: string | number | undefined | null): number {
  return parseQuantity(value) * 1000;
}

/**
 * Always vCPU with 3 decimals: 0.250 vCPU, 1.200 vCPU, 0.001 vCPU.
 *
 * 0.001 vCPU = 1 millicore, and the value is rounded UP to the millicore like `kubectl top`
 * (`quantity.MilliValue()`): kubectl's 250m is exactly 0.250 vCPU here, and 0.2m of usage shows as
 * 0.001 vCPU, never 0.000. The small epsilon absorbs float error from summing nanocores.
 */
export function formatVcpu(millicores: number): string {
  const m = Math.max(0, Math.ceil(millicores - 1e-6));

  return `${ (m / 1000).toFixed(3) } vCPU`;
}

/** Whole MiB, rounded DOWN like `kubectl top` (`quantity.Value() / (1024*1024)`) */
export function toMib(bytes: number): number {
  return Math.max(0, Math.floor(bytes / 2 ** 20));
}

/**
 * Below 1 GiB: whole MiB, no decimals (900 MiB). From 1 GiB (1024 MiB): GiB with 2 decimals (1.50 GiB, 12.06 GiB).
 *
 * - Derived from the whole-MiB value `kubectl top` prints (rounded down), so it never disagrees with
 *   kubectl; the exact MiB is also in the tooltip (`formatMib`).
 * - Display only: every sort (node detail pods tab, Top pods panel) uses the raw byte count, so
 *   900 MiB always sorts below 1.50 GiB regardless of the unit shown.
 */
export function formatMemory(bytes: number): string {
  const mib = toMib(bytes);

  if (mib < 1024) {
    return `${ mib } MiB`;
  }

  return `${ (mib / 1024).toFixed(2) } GiB`;
}

/** Exact `kubectl top` value with a thousands separator: 12,345 MiB */
export function formatMib(bytes: number): string {
  return `${ toMib(bytes).toLocaleString('en-US') } MiB`;
}
