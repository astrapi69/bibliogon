/**
 * Connectivity monitor for offline-capable (LAN/mobile) mode
 * (mobile-sync Phase 3, C2).
 *
 * Tracks whether the desktop backend is actually reachable, which is
 * NOT the same as `navigator.onLine` (that only knows a network
 * interface exists, not that our `/api` answers — e.g. the phone has
 * Wi-Fi but the desktop is asleep). So the monitor combines:
 *   - `navigator.onLine` + the window `online`/`offline` events for an
 *     instant signal, and
 *   - a periodic fetch-probe to `/api/health` for ground truth.
 *
 * The monitor is OPT-IN and inert by default: it only runs when offline
 * capability is enabled (the user took a book offline, C3) and the
 * `start()` call wires the listeners + probe. The normal desktop
 * `make dev` flow never enables it, never probes, and `isOnline()`
 * stays `true` — so the desktop storage path is unaffected.
 */

const OFFLINE_ENABLED_KEY = "bibliogon.offline_enabled";
const PROBE_PATH = "/api/health";
const PROBE_INTERVAL_MS = 15_000;

/** Whether offline capability is switched on for this client. Set true
 *  when the first book is taken offline (C3); read by getStorage() and
 *  the connectivity monitor as the master gate. */
export function isOfflineEnabled(): boolean {
  try {
    return localStorage.getItem(OFFLINE_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setOfflineEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(OFFLINE_ENABLED_KEY, "true");
    else localStorage.removeItem(OFFLINE_ENABLED_KEY);
  } catch {
    /* localStorage unavailable — no-op */
  }
}

type Listener = (online: boolean) => void;

class ConnectivityMonitor {
  private online = true;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  isOnline(): boolean {
    return this.online;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Begin monitoring (idempotent). Wires window events + the health
   *  probe and seeds the initial state from `navigator.onLine`. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.setOnline(navigator.onLine);
    window.addEventListener("online", this.handleOnlineEvent);
    window.addEventListener("offline", this.handleOfflineEvent);
    this.timer = setInterval(() => void this.probe(), PROBE_INTERVAL_MS);
    void this.probe();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener("online", this.handleOnlineEvent);
    window.removeEventListener("offline", this.handleOfflineEvent);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Probe `/api/health`; flip to offline on any failure, online on a
   *  2xx. Exposed for tests + the "back online?" retry. */
  async probe(): Promise<boolean> {
    try {
      const res = await fetch(PROBE_PATH, { method: "GET", cache: "no-store" });
      this.setOnline(res.ok);
      return res.ok;
    } catch {
      this.setOnline(false);
      return false;
    }
  }

  private handleOnlineEvent = (): void => {
    // The OS thinks we're online; confirm the backend actually answers.
    void this.probe();
  };

  private handleOfflineEvent = (): void => {
    this.setOnline(false);
  };

  private setOnline(next: boolean): void {
    if (next === this.online) return;
    this.online = next;
    for (const listener of this.listeners) listener(next);
  }

  /** Test-only: force a state + clear listeners/timer. */
  __resetForTests(forceOnline = true): void {
    this.stop();
    this.online = forceOnline;
    this.listeners.clear();
  }
}

export const connectivity = new ConnectivityMonitor();
