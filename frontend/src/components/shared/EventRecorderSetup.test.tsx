import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import EventRecorderSetup from "./EventRecorderSetup";
import { eventRecorder } from "../../utils/eventRecorder/eventRecorder";

// Controllable feature verdict feeding the EVT-06 gate.
let active = true;
vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({ isActive: active, state: active ? "active" : "disabled" }),
}));

// Avoid touching Dexie persistence in this unit test.
const initPersistence = vi.fn(async () => undefined);
vi.mock("../../utils/eventRecorder/eventRecorderPersist", () => ({
    initEventLogPersistence: () => initPersistence(),
}));

function renderRecorder() {
    return render(
        <MemoryRouter>
            <EventRecorderSetup />
            <button data-testid="probe-btn">Probe</button>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    active = true;
    eventRecorder.clear();
    initPersistence.mockClear();
});

afterEach(() => {
    eventRecorder.clear();
});

describe("EventRecorderSetup (EVT-06 gate)", () => {
    it("records button clicks and restores persistence while the feature is active", () => {
        renderRecorder();
        fireEvent.click(document.querySelector("[data-testid='probe-btn']")!);

        const events = eventRecorder.getAll();
        expect(events.some((e) => e.type === "click" && e.text === "Probe")).toBe(true);
        expect(initPersistence).toHaveBeenCalled();
    });

    it("installs no listeners and restores nothing while the feature is inactive", () => {
        active = false;
        renderRecorder();
        fireEvent.click(document.querySelector("[data-testid='probe-btn']")!);

        expect(eventRecorder.getAll()).toHaveLength(0);
        expect(initPersistence).not.toHaveBeenCalled();
    });
});
