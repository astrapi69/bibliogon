/**
 * Dexie persistence for the event recorder (EVT-02).
 *
 * The in-memory ring buffer (`eventRecorder`) is lost on tab close,
 * refresh, or crash — exactly when a diagnostic log would matter most.
 * This module mirrors the buffer into the Dexie `eventLog` table as a
 * single snapshot row so the history survives a reload and the user can
 * still export it after the event that caused the crash.
 *
 * Flush policy (per EXP-002 sec. 82-86):
 * - error-class events (`api_error` / `uncaught_error` /
 *   `unhandled_rejection`) persist IMMEDIATELY — the crash that loses
 *   the buffer is the one we most need to keep.
 * - all other events persist on a ~10s debounce, to avoid an IndexedDB
 *   write per click.
 *
 * The recorder stays framework- and storage-agnostic: it exposes a
 * post-add listener; this module owns the Dexie wiring. Both storage
 * modes (api / dexie) use Dexie for this local-only diagnostic log;
 * nothing is ever sent to a backend.
 */

import {
    EVENT_LOG_KEY,
    offlineDb,
    type EventLogSnapshot,
} from "../../storage/dexie/schema";
import {
    eventRecorder,
    type EventType,
    type RecordedEvent,
} from "./eventRecorder";

/** Default debounce window for normal (non-error) events, in ms. */
const DEFAULT_DEBOUNCE_MS = 10_000;

/** Event types that trigger an immediate persist instead of debounce. */
const ERROR_EVENT_TYPES: ReadonlySet<EventType> = new Set([
    "api_error",
    "uncaught_error",
    "unhandled_rejection",
]);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let debounceMs = DEFAULT_DEBOUNCE_MS;

/** Persist the current buffer as the single snapshot row. Never throws. */
async function flush(): Promise<void> {
    if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    const snapshot: EventLogSnapshot = {
        id: EVENT_LOG_KEY,
        events: eventRecorder.getAll(),
        updatedAt: new Date().toISOString(),
    };
    try {
        await offlineDb.eventLog.put(snapshot);
    } catch (error) {
        console.error("Failed to persist event log", error);
    }
}

/** Schedule a debounced flush, collapsing rapid bursts into one write. */
function scheduleFlush(): void {
    if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void flush();
    }, debounceMs);
}

/**
 * Restore the persisted buffer into the recorder, then register the
 * post-add listener so future events are mirrored to Dexie.
 *
 * Call once at app startup (before or just after the auto-capture
 * listeners mount). Idempotent and crash-safe: a missing or unreadable
 * snapshot simply starts with an empty buffer.
 *
 * @param options.debounceMs - debounce window for normal events; defaults
 *   to 10s. Lets tests use a short window without fake timers.
 */
export async function initEventLogPersistence(options?: {
    debounceMs?: number;
}): Promise<void> {
    debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    try {
        const snapshot = await offlineDb.eventLog.get(EVENT_LOG_KEY);
        if (snapshot?.events?.length) {
            eventRecorder.load(snapshot.events as RecordedEvent[]);
        }
    } catch (error) {
        console.error("Failed to restore event log", error);
    }

    eventRecorder.setListener((event) => {
        if (ERROR_EVENT_TYPES.has(event.type)) {
            void flush();
        } else {
            scheduleFlush();
        }
    });
}
