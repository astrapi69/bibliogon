/**
 * Backend-reachability state for the persistent "Backend nicht
 * erreichbar" banner (#765).
 *
 * Event-driven, NOT poll-driven: `guardedFetch` reports every
 * network-level failure and every received response, so during normal
 * operation this module costs nothing. Only WHILE down does a light
 * `/api/health` probe run (every 10s) so the banner also clears when
 * the user is idle; it stops on the first success. This is deliberately
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

import { BASE, isBackendlessOffline } from "./http";

const PROBE_INTERVAL_MS = 10_000;

type Listener = () => void;

class BackendReachability {
  private down = false;
  private listeners = new Set<Listener>();
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private onlineListener: (() => void) | null = null;

  /** Subscribe to down/up transitions. Returns the unsubscribe. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isDown(): boolean {
    return this.down;
  }

  /** Called by guardedFetch when a request died at the network level. */
  reportNetworkFailure(): void {
    if (this.down || isBackendlessOffline()) return;
    this.down = true;
    this.startProbe();
    this.emit();
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
    this.stopProbe();
    this.listeners.clear();
  }

  private async probe(): Promise<boolean> {
    try {
      await globalThis.fetch(`${BASE}/health`);
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
