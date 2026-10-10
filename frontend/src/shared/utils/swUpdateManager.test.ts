import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    initSwUpdateManager,
    subscribeToUpdates,
    applyUpdate,
    checkForUpdate,
    _resetSwUpdateManagerForTests,
} from "./swUpdateManager";

/**
 * Minimal fake ServiceWorker built on EventTarget so `addEventListener` +
 * `dispatchEvent("statechange")` behave like the real thing. `postMessage` is
 * a spy so the SKIP_WAITING assertion is straightforward.
 */
class FakeWorker extends EventTarget {
    state: string;
    postMessage = vi.fn();
    constructor(state: string) {
        super();
        this.state = state;
    }
    setState(state: string) {
        this.state = state;
        this.dispatchEvent(new Event("statechange"));
    }
}

/** Fake ServiceWorkerRegistration: EventTarget for `updatefound`. */
class FakeRegistration extends EventTarget {
    installing: FakeWorker | null = null;
    waiting: FakeWorker | null = null;
    active: FakeWorker | null = null;
    update = vi.fn(() => Promise.resolve());
}

/** Fake navigator.serviceWorker container (EventTarget for controllerchange). */
class FakeContainer extends EventTarget {
    controller: unknown = null;
    registration: FakeRegistration;
    constructor(registration: FakeRegistration) {
        super();
        this.registration = registration;
    }
    getRegistration() {
        return Promise.resolve(this.registration);
    }
}

let registration: FakeRegistration;
let container: FakeContainer;
let reloadSpy: ReturnType<typeof vi.fn>;
let teardown: (() => void) | null = null;

beforeEach(() => {
    _resetSwUpdateManagerForTests();
    registration = new FakeRegistration();
    container = new FakeContainer(registration);
    Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: container,
    });
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, reload: reloadSpy },
    });
});

afterEach(() => {
    if (teardown) {
        teardown();
        teardown = null;
    }
    vi.useRealTimers();
});

/** Drive the manager's async getRegistration() to settle. */
async function flush() {
    await Promise.resolve();
    await Promise.resolve();
}

describe("swUpdateManager", () => {
    it("notifies subscribers when an update installs and waits (controller present)", async () => {
        container.controller = {};
        teardown = initSwUpdateManager();
        await flush();

        const listener = vi.fn();
        subscribeToUpdates(listener);
        expect(listener).toHaveBeenLastCalledWith(false);

        const installing = new FakeWorker("installing");
        registration.installing = installing;
        registration.dispatchEvent(new Event("updatefound"));
        installing.setState("installed");

        expect(listener).toHaveBeenLastCalledWith(true);
    });

    it("does NOT signal an update on first install (no controller yet)", async () => {
        container.controller = null;
        teardown = initSwUpdateManager();
        await flush();

        const listener = vi.fn();
        subscribeToUpdates(listener);

        const installing = new FakeWorker("installing");
        registration.installing = installing;
        registration.dispatchEvent(new Event("updatefound"));
        installing.setState("installed");

        expect(listener).not.toHaveBeenCalledWith(true);
    });

    it("surfaces an already-waiting worker to a late subscriber", async () => {
        container.controller = {};
        const waiting = new FakeWorker("installed");
        registration.waiting = waiting;
        teardown = initSwUpdateManager();
        await flush();

        const listener = vi.fn();
        subscribeToUpdates(listener);
        expect(listener).toHaveBeenLastCalledWith(true);
    });

    it("applyUpdate posts SKIP_WAITING and reloads on controllerchange", async () => {
        container.controller = {};
        const waiting = new FakeWorker("installed");
        registration.waiting = waiting;
        teardown = initSwUpdateManager();
        await flush();

        applyUpdate();
        expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
        expect(reloadSpy).not.toHaveBeenCalled();

        container.dispatchEvent(new Event("controllerchange"));
        expect(reloadSpy).toHaveBeenCalledTimes(1);

        container.dispatchEvent(new Event("controllerchange"));
        expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it("applyUpdate is a no-op when no worker is waiting", async () => {
        container.controller = {};
        teardown = initSwUpdateManager();
        await flush();
        applyUpdate();
        expect(reloadSpy).not.toHaveBeenCalled();
    });

    it("checkForUpdate calls registration.update()", async () => {
        teardown = initSwUpdateManager();
        await flush();
        registration.update.mockClear();
        checkForUpdate();
        expect(registration.update).toHaveBeenCalledTimes(1);
    });

    it("proactively checks on visibilitychange", async () => {
        teardown = initSwUpdateManager();
        await flush();
        registration.update.mockClear();
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        expect(registration.update).toHaveBeenCalled();
    });

    it("degrades to a no-op when serviceWorker is unsupported", () => {
        Object.defineProperty(navigator, "serviceWorker", {
            configurable: true,
            value: undefined,
        });
        const t = initSwUpdateManager();
        expect(typeof t).toBe("function");
        expect(() => applyUpdate()).not.toThrow();
        expect(() => checkForUpdate()).not.toThrow();
        t();
    });
});

describe("checkForUpdateNow", () => {
    it("resolves 'up-to-date' when no worker is waiting", async () => {
        container.controller = {};
        registration.waiting = null;
        registration.installing = null;
        const { checkForUpdateNow } = await import("./swUpdateManager");
        await expect(checkForUpdateNow()).resolves.toBe("up-to-date");
        expect(registration.update).toHaveBeenCalled();
    });

    it("resolves 'update-available' when a worker is waiting", async () => {
        container.controller = {};
        registration.waiting = new FakeWorker("installed");
        const { checkForUpdateNow } = await import("./swUpdateManager");
        await expect(checkForUpdateNow()).resolves.toBe("update-available");
    });

    it("resolves 'error' when registration.update rejects (e.g. offline)", async () => {
        container.controller = {};
        registration.update = vi.fn(() => Promise.reject(new Error("offline")));
        const { checkForUpdateNow } = await import("./swUpdateManager");
        await expect(checkForUpdateNow()).resolves.toBe("error");
    });

    it("resolves 'unsupported' when no service worker is available (dev mode)", async () => {
        Object.defineProperty(navigator, "serviceWorker", {
            configurable: true,
            value: undefined,
        });
        const { checkForUpdateNow } = await import("./swUpdateManager");
        await expect(checkForUpdateNow()).resolves.toBe("unsupported");
    });
});

/**
 * #1065: `registration.update()` rejects with `InvalidStateError` when the
 * browser cannot name the script to re-fetch - the registration is still
 * installing, or it was torn down under the page (storage cleared, a
 * Danger-Zone reset, the browser's own "clear site data"). The call used to
 * be a bare `void reg.update()`, so the rejection reached the window as an
 * uncaught error: anything watching `window.onerror` saw it, and so did a
 * user with the console open.
 *
 * These assert the contract that replaced the bare `void`: `checkForUpdate`
 * hands back a promise that settles and never rejects. The window-level
 * observation is NOT asserted here - happy-dom does not fire
 * `unhandledrejection` for this, so a counter over that event is green
 * either way. The real-browser measurement is the prod-container gate
 * (#704), which is where the error was found.
 */
describe("swUpdateManager — a rejected update stays off the window (#1065)", () => {
    function invalidState(): DOMException {
        return new DOMException(
            "Failed to update a ServiceWorker for scope ('http://localhost/') " +
                "with script ('Unknown'): The object is in an invalid state.",
            "InvalidStateError",
        );
    }

    it("settles rather than rejecting when the cached registration throws", async () => {
        container.controller = {};
        teardown = initSwUpdateManager();
        await flush();
        registration.update = vi.fn(() => Promise.reject(invalidState()));

        await expect(checkForUpdate()).resolves.toBeUndefined();
    });

    it("settles rather than rejecting on the getRegistration path", async () => {
        registration.update = vi.fn(() => Promise.reject(invalidState()));

        // No initSwUpdateManager(), so the module has no cached registration
        // and checkForUpdate takes the getRegistration() branch.
        await expect(checkForUpdate()).resolves.toBeUndefined();
    });

    it("settles when getRegistration itself throws", async () => {
        container.getRegistration = () => Promise.reject(invalidState());

        await expect(checkForUpdate()).resolves.toBeUndefined();
    });

    it("skips the update entirely while a worker is still installing", async () => {
        container.controller = {};
        teardown = initSwUpdateManager();
        await flush();
        registration.installing = new FakeWorker("installing");

        await checkForUpdate();

        // The first-load case the issue calls the one that reaches users: the
        // page registers a worker and a focus/visibility event fires while it
        // is still installing. There is nothing to re-fetch, so the right
        // behaviour is not to ask.
        expect(registration.update).not.toHaveBeenCalled();
    });

    it("skips the update when the active worker is redundant", async () => {
        container.controller = {};
        teardown = initSwUpdateManager();
        await flush();
        registration.active = new FakeWorker("redundant");

        await checkForUpdate();

        expect(registration.update).not.toHaveBeenCalled();
    });

    it("keeps checking after a rejected check", async () => {
        container.controller = {};
        teardown = initSwUpdateManager();
        await flush();
        const update = vi
            .fn()
            .mockImplementationOnce(() => Promise.reject(invalidState()))
            .mockImplementation(() => Promise.resolve());
        registration.update = update;

        await checkForUpdate();
        await checkForUpdate();

        // A swallowed failure must not latch anything off: the next tick is
        // the whole recovery story for a torn-down registration.
        expect(update).toHaveBeenCalledTimes(2);
    });

    it("reports an installing worker as an update, not an error, on demand", async () => {
        container.controller = {};
        teardown = initSwUpdateManager();
        await flush();
        registration.installing = new FakeWorker("installing");
        registration.update = vi.fn(() => Promise.reject(invalidState()));

        const {checkForUpdateNow} = await import("./swUpdateManager");

        // The Settings button used to call update() unguarded, so an update
        // that was already installing resolved as "error" - the one state in
        // which the news is good.
        await expect(checkForUpdateNow()).resolves.toBe("update-available");
    });
});
