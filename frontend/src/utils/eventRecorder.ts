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

    return copy;
}

// ---------------------------------------------------------------------------
// Ring Buffer
// ---------------------------------------------------------------------------

const MAX_BUFFER_SIZE = 100;

class EventRingBuffer {
    private buffer: RecordedEvent[] = [];

    add(event: RecordedEvent): void {
        const sanitized = sanitizeEvent(event);
        this.buffer.push(sanitized);
        if (this.buffer.length > MAX_BUFFER_SIZE) {
            this.buffer.shift();
        }
    }

    getAll(): RecordedEvent[] {
        return [...this.buffer];
    }

    size(): number {
        return this.buffer.length;
    }

    clear(): void {
        this.buffer = [];
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

/** Render the event buffer as a human-readable multi-line string. */
export function formatEventLog(events?: RecordedEvent[]): string {
    const items = events || eventRecorder.getAll();
    return items.map((ev) => {
        const time = formatTime(ev.timestamp);
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
    }).join("\n");
}
