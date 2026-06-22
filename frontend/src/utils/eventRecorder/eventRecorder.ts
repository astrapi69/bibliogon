/**
 * Event recorder for error reporting.
 *
 * Records user actions (clicks, navigation, API calls, toasts) in a
 * fixed-size ring buffer. The buffer lives in RAM only — nothing is
 * persisted, nothing is sent to any server, and everything is lost on
 * tab close.
 *
 * The recorded history is only used when the user explicitly clicks
 * "Issue melden" and opts in to including the action history in the
 * GitHub issue body.
 *
 * Privacy guarantees:
 * - No keyboard input is ever recorded
 * - No textarea/editor content is ever recorded
 * - Fields matching sensitive patterns (password, token, key, license,
 *   secret) are redacted before entering the buffer
 * - URL query parameters are stripped
 * - All text is truncated to 200 chars max
 */

import {RingBuffer} from "../../lib/utils/RingBuffer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventType =
    | "click"
    | "navigation"
    | "dialog_open"
    | "dialog_close"
    | "dropdown_change"
    | "checkbox_change"
    | "file_upload"
    | "api_call"
    | "api_error"
    | "toast"
    | "uncaught_error"
    | "unhandled_rejection";

/**
 * Optional semantic category axis (EVT-05), additive to {@link EventType}.
 * Where `type` records the mechanical shape of an interaction (a click, an
 * API call), `category` records the domain it belongs to, so a bug report
 * reads at a glance which subsystem the user was exercising.
 */
export type EventCategory =
    | "storage"
    | "import"
    | "export"
    | "editor"
    | "network"
    | "error";

/**
 * Optional per-entry snapshot of the app context at record time (EVT-05).
 * A small, non-sensitive subset; all fields optional. Mirrors the once-only
 * app-state block that the export already appends, but per entry so a long
 * session that switched mode/theme/language stays attributable.
 */
export interface EventAppState {
    /** Effective storage backend ("api" | "dexie"). */
    mode?: string;
    /** Active UI language code (e.g. "de", "en"). */
    language?: string;
    /** navigator.onLine at record time. */
    online?: boolean;
    /** Active theme variant. */
    theme?: string;
    /** App version string. */
    version?: string;
}

export interface RecordedEvent {
    type: EventType;
    /** Milliseconds since page load (performance.now). */
    timestamp: number;
    /** Human-readable label (button text, dialog title, field name). */
    text?: string;
    /** data-testid of the element if present. */
    testId?: string;
    /** HTTP method for API calls. */
    method?: string;
    /** URL path (no query params, no host). */
    endpoint?: string;
    /** HTTP status code. */
    status?: number;
    /** Duration in ms for API calls. */
    durationMs?: number;
    /** Changed value for dropdowns/checkboxes. */
    value?: string;
    /** Field name for form interactions. */
    field?: string;
    /** Error message or toast text. */
    message?: string;
    /** Toast level (info/success/warning/error). */
    level?: string;
    /** Source file for uncaught errors. */
    source?: string;
    /** Line number for uncaught errors. */
    line?: number;
    /** Old and new path for navigation. */
    from?: string;
    to?: string;
    /** Optional semantic category, additive to {@link EventType} (EVT-05). */
    category?: EventCategory;
    /** Optional semantic action verb in free text, additive (EVT-05). */
    action?: string;
    /** Optional per-entry app-state snapshot (EVT-05). */
    appState?: EventAppState;
}

// ---------------------------------------------------------------------------
// Sanitizer
// ---------------------------------------------------------------------------

const SENSITIVE_FIELD = /password|token|api.?key|secret|license|credential/i;
const MAX_TEXT_LENGTH = 200;

export function sanitizeEvent(event: RecordedEvent): RecordedEvent {
    const copy = {...event};

    // Redact values that look like credentials
    if (copy.field && SENSITIVE_FIELD.test(copy.field)) {
        copy.value = "[REDACTED]";
    }
    if (copy.text && SENSITIVE_FIELD.test(copy.text)) {
        copy.text = "[REDACTED]";
    }
    if (copy.action && SENSITIVE_FIELD.test(copy.action)) {
        copy.action = "[REDACTED]";
    }

    // Strip query params from URLs
    if (copy.endpoint) {
        try {
            const url = new URL(copy.endpoint, "http://localhost");
            copy.endpoint = url.pathname;
        } catch {
            // not a URL, leave as-is
        }
    }
    if (copy.to) {
        try {
            copy.to = new URL(copy.to, "http://localhost").pathname;
        } catch { /* ignore */ }
    }

    // Truncate long text
    if (copy.text && copy.text.length > MAX_TEXT_LENGTH) {
        copy.text = copy.text.substring(0, MAX_TEXT_LENGTH) + "...";
    }
    if (copy.message && copy.message.length > MAX_TEXT_LENGTH) {
        copy.message = copy.message.substring(0, MAX_TEXT_LENGTH) + "...";
    }
    if (copy.action && copy.action.length > MAX_TEXT_LENGTH) {
        copy.action = copy.action.substring(0, MAX_TEXT_LENGTH) + "...";
    }

    return copy;
}

// ---------------------------------------------------------------------------
// Ring Buffer
// ---------------------------------------------------------------------------

const MAX_BUFFER_SIZE = 100;

/** Notified after each `add`, with the sanitized event that landed in the
 *  buffer. The persistence module (EVT-02) registers one to flush the
 *  buffer to Dexie. Kept framework- and storage-agnostic: the recorder
 *  itself never imports Dexie. */
export type EventListener = (event: RecordedEvent) => void;

/**
 * App-specific wrapper around the generic {@link RingBuffer}.
 *
 * Sanitizes each event before storing it and exposes the stable
 * `add` / `getAll` / `size` / `clear` API that the auto-capture
 * listeners, the ErrorReportDialog, and the persistence module
 * depend on. `getAll` returns events oldest-first.
 */
class EventRingBuffer {
    private buffer = new RingBuffer<RecordedEvent>(MAX_BUFFER_SIZE);
    private listener: EventListener | null = null;

    add(event: RecordedEvent): void {
        const sanitized = sanitizeEvent(event);
        this.buffer.push(sanitized);
        this.listener?.(sanitized);
    }

    getAll(): RecordedEvent[] {
        return this.buffer.toArray();
    }

    size(): number {
        return this.buffer.size();
    }

    clear(): void {
        this.buffer.clear();
    }

    /**
     * Register the single post-add listener (EVT-02 persistence flush).
     * The events are already sanitized; the listener must not throw.
     */
    setListener(listener: EventListener | null): void {
        this.listener = listener;
    }

    /**
     * Replace the buffer contents with a restored snapshot (EVT-02
     * startup restore). Events are pushed in order (oldest-first) and are
     * assumed already sanitized; the listener does NOT fire, so a restore
     * never re-triggers a persist.
     */
    load(events: RecordedEvent[]): void {
        this.buffer.clear();
        for (const event of events) {
            this.buffer.push(event);
        }
    }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Global event recorder instance. Import and use from anywhere. */
export const eventRecorder = new EventRingBuffer();

// ---------------------------------------------------------------------------
// Formatter (for the preview dialog)
// ---------------------------------------------------------------------------

/** Format a timestamp (performance.now ms) as HH:MM:SS. */
function formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Render the mechanical (type-based) portion of one event line. */
function formatBaseLine(ev: RecordedEvent, time: string): string {
    switch (ev.type) {
        case "click":
            return `${time}  Klick: "${ev.text || "?"}"${ev.testId ? ` [${ev.testId}]` : ""}`;
        case "navigation":
            return `${time}  Navigation: ${ev.from || "?"} -> ${ev.to || "?"}`;
        case "dialog_open":
            return `${time}  Dialog geöffnet: "${ev.text || "?"}"`;
        case "dialog_close":
            return `${time}  Dialog geschlossen: "${ev.text || "?"}"`;
        case "dropdown_change":
            return `${time}  Dropdown: ${ev.field || "?"} = "${ev.value || "?"}"`;
        case "checkbox_change":
            return `${time}  Checkbox: ${ev.field || "?"} = ${ev.value || "?"}`;
        case "file_upload":
            return `${time}  Upload: ${ev.text || "Datei"} (${ev.value || "?"})`;
        case "api_call":
            return `${time}  API: ${ev.method || "?"} ${ev.endpoint || "?"} -> ${ev.status || "?"} (${ev.durationMs || 0}ms)`;
        case "api_error":
            return `${time}  API Fehler: ${ev.method || "?"} ${ev.endpoint || "?"} -> ${ev.message || "?"}`;
        case "toast":
            return `${time}  Toast: ${ev.level || "?"} "${ev.message || "?"}"`;
        case "uncaught_error":
            return `${time}  Uncaught Error: ${ev.message || "?"} (${ev.source || "?"}:${ev.line || "?"})`;
        case "unhandled_rejection":
            return `${time}  Unhandled Rejection: ${ev.message || "?"}`;
        default:
            return `${time}  ${ev.type}: ${ev.text || ev.message || ""}`;
    }
}

/**
 * Render the optional semantic axis (EVT-05) as a suffix: a `{category:action}`
 * tag plus a compact `(mode=…, lang=…)` app-state block. Returns an empty
 * string when no semantic context is present, so legacy events are unchanged.
 */
function formatContext(ev: RecordedEvent): string {
    let suffix = "";
    if (ev.category || ev.action) {
        const tag =
            ev.category && ev.action ? `${ev.category}:${ev.action}` : ev.category || ev.action;
        suffix += ` {${tag}}`;
    }
    if (ev.appState) {
        const state = ev.appState;
        const parts: string[] = [];
        if (state.mode) parts.push(`mode=${state.mode}`);
        if (state.language) parts.push(`lang=${state.language}`);
        if (state.online !== undefined) parts.push(`online=${state.online}`);
        if (state.theme) parts.push(`theme=${state.theme}`);
        if (state.version) parts.push(`v${state.version}`);
        if (parts.length) suffix += ` (${parts.join(", ")})`;
    }
    return suffix;
}

/** Render the event buffer as a human-readable multi-line string. */
export function formatEventLog(events?: RecordedEvent[]): string {
    const items = events || eventRecorder.getAll();
    return items
        .map((ev) => formatBaseLine(ev, formatTime(ev.timestamp)) + formatContext(ev))
        .join("\n");
}
