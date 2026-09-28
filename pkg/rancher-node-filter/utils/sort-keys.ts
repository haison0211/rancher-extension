// @ts-ignore named export from a .vue file (the .vue type shim only declares a default export)
import { defaultTableSortGenerationFn } from '@shell/components/ResourceTable.vue';

/**
 * Rancher's SortableTable sorts by property paths on the row (e.g. `cpuUsage`). Live metrics are not
 * properties of the Rancher model, so to sort by them we add a read-only getter to the row instance.
 *
 * The property is non-enumerable: it is invisible to Object.keys, JSON, cleanForSave and the store's
 * replaceResource, so nothing Rancher does with the object changes.
 */
export function defineSortKey(row: any, key: string, getter: (row: any) => number): void {
  if (!row || Object.prototype.hasOwnProperty.call(row, key)) {
    return;
  }

  Object.defineProperty(row, key, {
    get() {
      return getter(row);
    },
    enumerable:   false,
    configurable: true,
  });
}

/**
 * Build a `sortGenerationFn` for ResourceTable / SortableTable.
 *
 * - SortableTable caches the sorted order per "sort generation" (resource type generation in the store).
 *   Metrics refresh without changing that generation, so the cached order would go stale. Adding the
 *   metrics fetch times to the key makes the table re-sort whenever fresh numbers arrive.
 * - SortableTable calls this right before sorting (client-side sort only), so it is also the one place
 *   that is guaranteed to see every row: `decorateRows` adds the sort keys there, including rows the
 *   store replaced or added since the last render.
 */
export function sortGenerationWith(decorateRows: () => void, ...versions: Array<() => number>) {
  return (schema: any, store: any): string => {
    decorateRows();

    const base = defaultTableSortGenerationFn(schema, store) || schema?.id || 'rows';

    return `${ base }/${ versions.map((v) => v()).join('/') }`;
  };
}

/** Numeric sort value for a percentage that may be unknown: unknown sorts below every real value */
export function sortablePercent(value: number | undefined): number {
  return value === undefined || isNaN(value) ? -1 : value;
}
