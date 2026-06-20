import {describe, it, expect, beforeEach} from "vitest";
import {
    eventRecorder,
    sanitizeEvent,
    formatEventLog,
    type RecordedEvent,
} from "./eventRecorder";

beforeEach(() => {
    eventRecorder.clear();
});

// --- Ring Buffer ---

describe("EventRingBuffer", () => {
    it("adds and retrieves events", () => {
        eventRecorder.add({type: "click", timestamp: 1000, text: "Save"});
        expect(eventRecorder.size()).toBe(1);
        expect(eventRecorder.getAll()[0].text).toBe("Save");
    });

    it("respects max size of 100", () => {
        for (let i = 0; i < 120; i++) {
            eventRecorder.add({type: "click", timestamp: i * 100, text: `btn-${i}`});
        }
        expect(eventRecorder.size()).toBe(100);
        // Oldest events are dropped
        expect(eventRecorder.getAll()[0].text).toBe("btn-20");
        expect(eventRecorder.getAll()[99].text).toBe("btn-119");
    });

    it("clear empties the buffer", () => {
        eventRecorder.add({type: "click", timestamp: 0, text: "x"});
        eventRecorder.clear();
        expect(eventRecorder.size()).toBe(0);
    });

    it("getAll returns a copy, not a reference", () => {
        eventRecorder.add({type: "click", timestamp: 0, text: "a"});
        const copy = eventRecorder.getAll();
        copy.pop();
        expect(eventRecorder.size()).toBe(1);
    });
});

// --- Sanitizer ---

describe("sanitizeEvent", () => {
    it("redacts fields matching sensitive patterns", () => {
        const ev: RecordedEvent = {type: "dropdown_change", timestamp: 0, field: "api_key", value: "sk_secret_123"};
        const sanitized = sanitizeEvent(ev);
        expect(sanitized.value).toBe("[REDACTED]");
    });

    it("redacts password fields", () => {
        const ev: RecordedEvent = {type: "dropdown_change", timestamp: 0, field: "password", value: "hunter2"};
        expect(sanitizeEvent(ev).value).toBe("[REDACTED]");
    });

    it("redacts license fields", () => {
        const ev: RecordedEvent = {type: "dropdown_change", timestamp: 0, field: "license_key", value: "BIBLIO-123"};
        expect(sanitizeEvent(ev).value).toBe("[REDACTED]");
    });

    it("redacts text containing token/key references", () => {
        const ev: RecordedEvent = {type: "click", timestamp: 0, text: "Save API Key"};
        expect(sanitizeEvent(ev).text).toBe("[REDACTED]");
    });

    it("strips query params from endpoints", () => {
        const ev: RecordedEvent = {type: "api_call", timestamp: 0, endpoint: "/api/books?secret=abc&lang=de"};
        expect(sanitizeEvent(ev).endpoint).toBe("/api/books");
    });

    it("truncates long text to 200 chars", () => {
        const longText = "x".repeat(500);
        const ev: RecordedEvent = {type: "click", timestamp: 0, text: longText};
        const sanitized = sanitizeEvent(ev);
        expect(sanitized.text!.length).toBeLessThanOrEqual(203); // 200 + "..."
        expect(sanitized.text!.endsWith("...")).toBe(true);
    });

    it("truncates long messages", () => {
        const ev: RecordedEvent = {type: "toast", timestamp: 0, message: "e".repeat(300)};
        expect(sanitizeEvent(ev).message!.length).toBeLessThanOrEqual(203);
    });

    it("does not modify non-sensitive events", () => {
        const ev: RecordedEvent = {type: "click", timestamp: 1234, text: "Export"};
        const sanitized = sanitizeEvent(ev);
        expect(sanitized).toEqual(ev);
    });
});

// --- Formatter ---

describe("formatEventLog", () => {
    it("formats click events", () => {
        const events: RecordedEvent[] = [
            {type: "click", timestamp: 3661000, text: "Save"},
        ];
        const log = formatEventLog(events);
        expect(log).toContain("01:01:01");
        expect(log).toContain('Klick: "Save"');
    });

    it("formats navigation events", () => {
        const events: RecordedEvent[] = [
            {type: "navigation", timestamp: 0, from: "/books", to: "/books/123"},
        ];
        const log = formatEventLog(events);
        expect(log).toContain("/books -> /books/123");
    });

    it("formats API calls with status and duration", () => {
        const events: RecordedEvent[] = [
            {type: "api_call", timestamp: 0, method: "POST", endpoint: "/api/export", status: 200, durationMs: 1234},
        ];
        const log = formatEventLog(events);
        expect(log).toContain("POST /api/export -> 200 (1234ms)");
    });

    it("formats toast messages", () => {
        const events: RecordedEvent[] = [
            {type: "toast", timestamp: 0, level: "error", message: "Export failed"},
        ];
        const log = formatEventLog(events);
        expect(log).toContain('Toast: error "Export failed"');
    });
});
