import {describe, it, expect, beforeEach, afterEach, vi} from "vitest";
import "fake-indexeddb/auto";
import {EVENT_LOG_KEY, offlineDb} from "../storage/dexie/schema";
import {eventRecorder, type RecordedEvent} from "./eventRecorder";
import {initEventLogPersistence} from "./eventRecorderPersist";

beforeEach(async () => {
    await offlineDb.eventLog.clear();
    eventRecorder.clear();
    eventRecorder.setListener(null);
});

afterEach(() => {
    eventRecorder.setListener(null);
});

describe("eventRecorderPersist", () => {
    it("persists an error event immediately and round-trips it back", async () => {
        await initEventLogPersistence();

        eventRecorder.add({type: "click", timestamp: 1, text: "a"});
        eventRecorder.add({type: "uncaught_error", timestamp: 2, message: "boom"});

        await vi.waitFor(async () => {
            const row = await offlineDb.eventLog.get(EVENT_LOG_KEY);
            expect(row?.events).toHaveLength(2);
        });

        const row = await offlineDb.eventLog.get(EVENT_LOG_KEY);
        const stored = row!.events as RecordedEvent[];
        expect(stored.map((e) => e.type)).toEqual(["click", "uncaught_error"]);
        expect(stored[1].message).toBe("boom");
        expect(typeof row!.updatedAt).toBe("string");
    });

    it("restores a persisted snapshot into the recorder on init (order preserved)", async () => {
        const events: RecordedEvent[] = [
            {type: "navigation", timestamp: 1, from: "/a", to: "/b"},
            {type: "click", timestamp: 2, text: "Save"},
            {type: "toast", timestamp: 3, level: "error", message: "nope"},
        ];
        await offlineDb.eventLog.put({
            id: EVENT_LOG_KEY,
            events,
            updatedAt: new Date().toISOString(),
        });

        await initEventLogPersistence();

        expect(eventRecorder.getAll()).toEqual(events);
    });

    it("debounces normal events instead of persisting per add", async () => {
        await initEventLogPersistence({debounceMs: 20});

        eventRecorder.add({type: "click", timestamp: 1, text: "one"});
        eventRecorder.add({type: "click", timestamp: 2, text: "two"});

        expect(await offlineDb.eventLog.get(EVENT_LOG_KEY)).toBeUndefined();

        await vi.waitFor(async () => {
            const row = await offlineDb.eventLog.get(EVENT_LOG_KEY);
            expect((row?.events as RecordedEvent[] | undefined)?.map((e) => e.text)).toEqual([
                "one",
                "two",
            ]);
        });
    });

    it("caps the persisted snapshot at the buffer capacity (100)", async () => {
        await initEventLogPersistence();

        for (let i = 0; i < 150; i++) {
            eventRecorder.add({type: "api_error", timestamp: i, message: `e-${i}`});
        }

        await vi.waitFor(async () => {
            const row = await offlineDb.eventLog.get(EVENT_LOG_KEY);
            expect(row?.events).toHaveLength(100);
        });

        const row = await offlineDb.eventLog.get(EVENT_LOG_KEY);
        const stored = row!.events as RecordedEvent[];
        expect(stored[0].message).toBe("e-50");
        expect(stored[99].message).toBe("e-149");
    });

    it("starts empty when no snapshot exists", async () => {
        await initEventLogPersistence();
        expect(eventRecorder.getAll()).toEqual([]);
    });
});
