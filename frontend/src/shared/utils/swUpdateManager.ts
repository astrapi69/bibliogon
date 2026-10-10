/**
 * Service-worker update manager for the Bibliogon PWA.
 *
 * Builds on the v0.48.0 proactive-update behaviour (focus / visibility /
 * hourly `registration.update()` calls): this module adds the USER-FACING
 * half — it detects when a freshly-installed worker is WAITING and notifies
 * subscribers so the app can render the "new version available" banner, then
 * applies the update under user control.
 *
 * The PWA is configured with `registerType: "prompt"` (see
 * `frontend/vite.config.ts`), so a new worker installs and then waits instead
 * of auto-`skipWaiting`-ing. {@link onUpdate} posts `{type:"SKIP_WAITING"}` to
 * the waiting worker; the generated SW handles that message by calling
 * `self.skipWaiting()`, which fires `controllerchange`, and this module then
 * reloads the page so the new bundle takes over.
 *
 * Autosave safety: the reload is a normal navigation, so the browser fires
 * `beforeunload` / `pagehide` first. The editor's `useFlushOnUnload` hook
 * listens to those and flushes any pending chapter content to IndexedDB
 * before the page goes away, so no unsaved editor content is lost.
 *
 * The SW APIs are unavailable under jsdom / happy-dom and disabled in dev
 * (`devOptions.enabled: false`), so every entry point degrades to a no-op
 * when `navigator.serviceWorker` is absent. Vitest mocks the registration.
 */

/** Notified whenever the waiting-worker state changes. */
export type UpdateListener = (updateAvailable: boolean) => void;

const HOURLY_MS = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | null = null;
let waitingWorker: ServiceWorker | null = null;
let reloading = false;
const listeners = new Set<UpdateListener>();

/** True when a service worker is genuinely available in this environment. */
function swSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker != null
  );
}

/** Broadcast the current waiting-worker availability to all subscribers. */
function notify(): void {
  const available = waitingWorker !== null;
  for (const listener of listeners) listener(available);
}

/** Record a waiting worker (if any) and notify subscribers on change. */
function setWaiting(worker: ServiceWorker | null): void {
  if (worker === waitingWorker) return;
  waitingWorker = worker;
  notify();
}

/**
 * Watch a newly-found installing worker: once it reaches `installed` AND a
 * controller already exists (i.e. this is an UPDATE, not the first install),
 * it is the waiting worker that the banner should surface.
 */
function trackInstalling(installing: ServiceWorker): void {
  installing.addEventListener("statechange", () => {
    if (installing.state === "installed" && navigator.serviceWorker.controller) {
      setWaiting(installing);
    }
  });
}

/**
 * Wire a registration's update-detection events. Surfaces an already-waiting
 * worker immediately (covers the case where the worker installed before the
 * app subscribed) and tracks any future `updatefound` transitions.
 */
function wireRegistration(reg: ServiceWorkerRegistration): void {
  registration = reg;
  if (reg.waiting && navigator.serviceWorker.controller) {
    setWaiting(reg.waiting);
  }
  reg.addEventListener("updatefound", () => {
    const installing = reg.installing;
    if (installing) trackInstalling(installing);
  });
}

/**
 * Subscribe to update-availability changes. Returns an unsubscribe function.
 * The listener is invoked immediately with the current state so a late
 * subscriber still learns about an already-waiting worker.
 */
export function subscribeToUpdates(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(waitingWorker !== null);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Apply the pending update: tell the waiting worker to skip waiting, then
 * reload once it takes control (`controllerchange`). No-op when no worker is
 * waiting. The `controllerchange` -> reload handler is registered once.
 */
export function applyUpdate(): void {
  if (!swSupported()) return;
  const worker = waitingWorker;
  if (!worker) return;
  worker.postMessage({ type: "SKIP_WAITING" });
}

/** Reload exactly once when a new worker takes control. */
function handleControllerChange(): void {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

/**
 * Whether asking this registration for an update can do anything.
 *
 * `update()` rejects with `InvalidStateError` when the browser cannot name
 * the script to re-fetch, and two states produce that (#1065): a worker is
 * still installing, so there is no settled script yet; or the active worker
 * is `redundant`, which is what a registration torn down under the page
 * looks like. In both cases the check has nothing to ask for, so the right
 * move is not to ask - the hourly tick comes round again.
 */
function canRequestUpdate(reg: ServiceWorkerRegistration): boolean {
  if (reg.installing) return false;
  if (reg.active && reg.active.state === "redundant") return false;
  return true;
}

/**
 * Ask one registration for an update. Never rejects: a registration can be
 * torn down between the guard and the call (storage cleared, a Danger-Zone
 * reset, the browser's own "clear site data"), and there is nothing to
 * recover - the next check starts over.
 */
async function requestUpdate(reg: ServiceWorkerRegistration): Promise<void> {
  if (!canRequestUpdate(reg)) return;
  try {
    await reg.update();
  } catch (err) {
    // Debug, not warn: during a first install this is the expected outcome
    // of a focus event, and a user with the console open should not be shown
    // something they cannot act on.
    console.debug("[sw] update check skipped:", err);
  }
}

/**
 * Ask the active registration to check the server for a new worker. This is
 * the proactive half (kept from the v0.48.0 updater): the browser only checks
 * on navigation by default, so a long-open / reopened tab can sit on a stale
 * bundle until nudged.
 *
 * Returns a promise that settles and NEVER rejects. Callers are event
 * handlers and an interval, which ignore it; it exists so the
 * never-rejects contract is something a test can observe, rather than a
 * `void` whose failure only shows up as an uncaught error in a browser.
 */
export async function checkForUpdate(): Promise<void> {
  if (!swSupported()) return;
  if (registration) {
    await requestUpdate(registration);
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    wireRegistration(reg);
    await requestUpdate(reg);
  } catch (err) {
    console.debug("[sw] registration lookup failed:", err);
  }
}

/** Outcome of an on-demand {@link checkForUpdateNow} check. */
export type UpdateCheckResult = "update-available" | "up-to-date" | "unsupported" | "error";

/**
 * Run an on-demand update check and resolve with a classified result, for the
 * Settings > About "Check for new version" button. Unlike the fire-and-forget
 * {@link checkForUpdate}, this resolves a {@link UpdateCheckResult} the UI can
 * render:
 *
 *  - `unsupported` when no service worker is available (dev mode / no SW yet);
 *  - `update-available` when a new worker is waiting or installing;
 *  - `up-to-date` when the server has no newer worker;
 *  - `error` when `getRegistration()` / `update()` throws (e.g. offline).
 *
 * A discovered waiting worker is recorded via {@link setWaiting}, so the
 * "Update now" action ({@link applyUpdate}) works straight after a positive
 * check.
 */
export async function checkForUpdateNow(): Promise<UpdateCheckResult> {
  if (!swSupported()) return "unsupported";
  try {
    let reg = registration;
    if (!reg) {
      reg = (await navigator.serviceWorker.getRegistration()) ?? null;
      if (reg) wireRegistration(reg);
    }
    if (!reg) return "unsupported";
    // Guarded for the same reason as the proactive path: an update that is
    // already installing used to reject here and resolve as "error", which
    // is the one state in which the news is good (#1065).
    if (canRequestUpdate(reg)) {
      await reg.update();
    }
    const hasController = navigator.serviceWorker.controller != null;
    if (reg.waiting && hasController) {
      setWaiting(reg.waiting);
      return "update-available";
    }
    if ((reg.installing && hasController) || waitingWorker) {
      return "update-available";
    }
    return "up-to-date";
  } catch {
    return "error";
  }
}

/**
 * Initialise the manager: resolve the registration, wire its update events,
 * register the `controllerchange` reload handler, and schedule proactive
 * checks on tab focus / visibility, on an hourly interval, and on demand via
 * {@link checkForUpdate} (the app calls it on route change).
 *
 * Returns a teardown function that removes the listeners + interval; in
 * production the manager lives for the page lifetime, but the teardown keeps
 * it leak-free under React StrictMode double-mount and in tests.
 */
export function initSwUpdateManager(): () => void {
  if (!swSupported()) return () => {};

  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

  void navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg) wireRegistration(reg);
  });

  const onVisibility = (): void => {
    if (document.visibilityState === "visible") void checkForUpdate();
  };
  const onFocus = (): void => void checkForUpdate();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);
  const intervalId = window.setInterval(checkForUpdate, HOURLY_MS);

  return () => {
    navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
    window.clearInterval(intervalId);
  };
}

/**
 * Test-only reset of module-level state so each Vitest case starts clean.
 * Not used in production.
 */
export function _resetSwUpdateManagerForTests(): void {
  registration = null;
  waitingWorker = null;
  reloading = false;
  listeners.clear();
}
