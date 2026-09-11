/**
 * Backend-reachability state for the persistent "Backend nicht
 * erreichbar" banner (#765).
 *
 * Event-driven, NOT poll-driven: `guardedFetch` reports every
 * network-level failure and every received response, so during normal
 * operation this module costs nothing. A reported failure is CONFIRMED
 * by one immediate `/api/health` probe before the banner goes up, so a
 * single request's problem is never mistaken for a global outage (#770).
 * Only WHILE down does a light `/api/health` probe keep running (every
 * 10s) so the banner also clears when the user is idle; it stops on the
 * first success. This is deliberately
 * NOT `storage/connectivity.ts`: that monitor drives the offline
 * STORAGE-ROUTING decision, is opt-in (offline-enabled devices only),
 * and polls while healthy - conflating the two would break its
 * documented desktop-never-probes contract. This store answers one UI
 * question ("is the backend gone right now?") from traffic the app
 * makes anyway.
 *
 * The backendless (Dexie) build never reaches this module's failure
 * path: `guardedFetch` rejects with the `offline`-flagged ApiError
 * BEFORE any fetch, and the probe additionally refuses to start there.
 */

import { BASE, isBackendlessOffline, isProxyGatewayFailure } from "./apiBase";

const PROBE_INTERVAL_MS = 10_000;

type Listener = () => void;

class BackendReachability {
  private down = false;
  private listeners = new Set<Listener>();
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private onlineListener: (() => void) | null = null;
  /** The in-flight confirm probe, so parallel failures share one. */
  private confirming: Promise<boolean> | null = null;

  /** Subscribe to down/up transitions. Returns the unsubscribe. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isDown(): boolean {
    return this.down;
  }

  /** Called by guardedFetch when a request died at the network level.
   *
   *  Does NOT flip to down on the first failure (#770). A request-specific
   *  failure on a healthy backend - a reset on one oversized upload, a
   *  stalled long-running export - would otherwise raise the global outage
   *  banner AND have its own toast suppressed by the #765 dedup, so the
   *  user saw a banner vanish without ever learning what failed. One
   *  immediate `/api/health` probe decides instead; only if THAT fails is
   *  the backend really gone.
   *
   *  Returns the verdict (true = confirmed down) so guardedFetch can stamp
   *  it onto the ApiError it is about to reject with. `isDown()` stays
   *  synchronous and unchanged, so the toast-suppression path is
   *  untouched.
   *
   *  Parallel failures share ONE probe: during a real outage every
   *  in-flight request fails at once, and each spawning its own probe
   *  would multiply the traffic exactly when the backend is least able to
   *  answer it.
   */
  async reportNetworkFailure(): Promise<boolean> {
    if (isBackendlessOffline()) return false;
    if (this.down) return true;
    if (this.confirming !== null) return this.confirming;
    this.confirming = this.confirmDown();
    try {
      return await this.confirming;
    } finally {
      this.confirming = null;
    }
  }

  /** One probe decides whether a network failure is a global outage. */
  private async confirmDown(): Promise<boolean> {
    if (await this.probe()) return false;
    if (this.down) return true;
    this.down = true;
    this.startProbe();
    this.emit();
    return true;
  }

  /** Called by guardedFetch for EVERY received response - any HTTP
   *  status proves the backend is reachable, including 4xx/5xx. */
  reportBackendResponse(): void {
    if (!this.down) return;
    this.down = false;
    this.stopProbe();
    this.emit();
  }

  /** One immediate probe (the banner's "Erneut versuchen" button).
   *  Resolves true when the backend answered. */
  async retryNow(): Promise<boolean> {
    return this.probe();
  }

  /** Test hook: back to the pristine reachable state. */
  resetForTests(): void {
    this.down = false;
    this.confirming = null;
    this.stopProbe();
    this.listeners.clear();
  }

  /** One /api/health round-trip. True only when the BACKEND answered.
   *
   *  A resolved fetch is not enough: with the backend dead behind a live
   *  proxy the probe gets the proxy's non-JSON 502, which would otherwise
   *  read as proof of life - the banner would never appear (confirm path)
   *  and would clear itself while still down (interval path). The request
   *  path already discriminates this; the probe must agree. */
  private async probe(): Promise<boolean> {
    try {
      const response = await globalThis.fetch(`${BASE}/health`);
      if (isProxyGatewayFailure(response)) return false;
      this.reportBackendResponse();
      return true;
    } catch {
      return false;
    }
  }

  private startProbe(): void {
    if (this.probeTimer !== null) return;
    this.probeTimer = setInterval(() => {
      void this.probe();
    }, PROBE_INTERVAL_MS);
    // A device coming back online is the strongest hint that the backend may
    // be reachable again - probe at once instead of waiting out the interval,
    // otherwise this banner lingers after OfflineBanner already vanished.
    if (this.onlineListener === null && typeof window !== "undefined") {
      this.onlineListener = () => {
        void this.probe();
      };
      window.addEventListener("online", this.onlineListener);
    }
  }

  private stopProbe(): void {
    if (this.probeTimer !== null) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    if (this.onlineListener !== null && typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineListener);
      this.onlineListener = null;
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const backendReachability = new BackendReachability();
