export const recordWriteQueues = new Map<string, Promise<unknown>>();

/**
 * Serializes a read-modify-write critical section for a single record so two
 * near-simultaneous updates cannot clobber each other.
 *
 * Every DexieStorage `update*` method reads a row, shallow-merges the patch,
 * and writes the whole row back. Without serialization, two concurrent calls
 * on the same record each read the pre-other-write state, and the later
 * `put()` (built from a stale read) drops the other call's field changes -
 * silent data loss (the class PR #121 fixed for settings; e.g. an editor
 * content-autosave racing a title/status save on the same chapter).
 *
 * Operations are chained per `${table}:${id}` key: the same record runs
 * strictly in invocation order, while different records (different keys) run
 * concurrently and never block each other. The map entry is dropped once its
 * chain drains, so the map does not grow unbounded.
 *
 * The third argument is the full read-modify-write thunk (get -> merge -> put
 * -> return), NOT a pure `(existing) => merged` transform: the methods read
 * and write heterogeneous Dexie tables (some typed, some `GraphRow`-cast) and
 * carry post-merge side effects (version bump, writing-progress, author
 * normalization), so wrapping the whole operation keeps it atomic per record
 * with zero per-table accessor plumbing.
 *
 * @param table - Logical table name; namespaces the queue key only.
 * @param id - Record primary key within `table` (a fixed sentinel for
 *   singleton rows such as app settings).
 * @param operation - The read-modify-write thunk to run inside the per-record
 *   critical section. Its rejection propagates to the caller; the chain still
 *   advances so a failed write never deadlocks later writes to the record.
 * @returns Whatever `operation` resolves to.
 */

export function serializedUpdate<T>(
  table: string,
  id: string | number,
  operation: () => Promise<T>,
): Promise<T> {
  const key = `${table}:${id}`;
  const prev = recordWriteQueues.get(key) ?? Promise.resolve();
  const result = prev.then(operation);
  const tail = result.catch(() => undefined);
  recordWriteQueues.set(key, tail);
  void tail.then(() => {
    if (recordWriteQueues.get(key) === tail) recordWriteQueues.delete(key);
  });
  return result;
}

/** Populate the reference tables from the committed seed. Idempotent +
 *  non-destructive: writes only an ABSENT row, so a user-edited settings
 *  row (or a newly-added i18n language on seed regen) is never clobbered.
 *  Memoized so concurrent reads seed exactly once. */
