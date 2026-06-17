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
