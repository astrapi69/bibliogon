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

import { BASE, isBackendlessOffline, isProxyGatewayFailure } from "./apiBase";

const PROBE_INTERVAL_MS = 10_000;

// A dead network can leave the confirmation probe's connection hanging. Cap
// the unresolved window so a suspicion (and the toasts withheld behind it)
// cannot stall indefinitely.
const CONFIRM_TIMEOUT_MS = 3_000;

type Listener = () => void;
type SuspicionListener = (confirmedDown: boolean) => void;

class BackendReachability {
  private down = false;
  private suspected = false;
  private listeners = new Set<Listener>();
  private suspicionListeners = new Set<SuspicionListener>();
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private onlineListener: (() => void) | null = null;

  /** Subscribe to down/up transitions. Returns the unsubscribe. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to the outcome of a failure confirmation (#770).
   *
   *  Fires once per suspicion with `true` when the probe confirmed an
   *  outage and `false` when the backend answered, i.e. the failure was
   *  request-specific. `notify` uses the `false` case to release the
   *  toast it withheld while the suspicion was open.
   */
  subscribeSuspicion(listener: SuspicionListener): () => void {
    this.suspicionListeners.add(listener);
    return () => this.suspicionListeners.delete(listener);
  }

  isDown(): boolean {
    return this.down;
  }

  /** True while a reported failure is awaiting its confirmation probe.
   *  Synchronous, like `isDown()`, because the toast decision is made at
   *  throw time. */
  isSuspected(): boolean {
    return this.suspected;
  }

  /** Called by guardedFetch when a request died at the network level.
   *
   *  A single failure is NOT proof of an outage: one oversized upload
   *  reset or one stalled export fails on a perfectly healthy backend
   *  (#770). The failure opens a suspicion and an immediate /api/health
   *  probe decides. `down` (and therefore the banner) flips only when
   *  that probe also fails.
   */
  reportNetworkFailure(): void {
    if (this.down || this.suspected || isBackendlessOffline()) return;
    this.suspected = true;
    void this.confirmFailure();
  }

  /** Called by guardedFetch for EVERY received response - any HTTP
   *  status proves the backend is reachable, including 4xx/5xx. */
  reportBackendResponse(): void {
    // A response is the same proof the confirmation probe was after, so it
    // settles an open suspicion immediately instead of waiting it out.
    if (this.suspected) {
      this.suspected = false;
      this.emitSuspicion(false);
    }
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

  /** Test hook: jump straight to the confirmed-down state, skipping the
   *  confirmation probe. For tests that exercise OUTAGE behaviour (toast
   *  suppression, banner) rather than the confirmation itself. */
  markDownForTests(): void {
    const wasSuspected = this.suspected;
    this.suspected = false;
    this.down = true;
    this.emit();
    // Settle an open suspicion so anything parked behind it is discarded,
    // exactly as a real confirmation would.
    if (wasSuspected) this.emitSuspicion(true);
  }

  /** Test hook: back to the pristine reachable state.
   *
   *  Transition listeners are dropped (they are per-component-mount
   *  subscriptions), but suspicion listeners are NOT: `notify` registers
   *  its withheld-toast release once at module load, and clearing it here
   *  would silently disable that release for the rest of the test file.
   */
  resetForTests(): void {
    this.down = false;
    this.suspected = false;
    this.stopProbe();
    this.listeners.clear();
  }

  /** Resolve an open suspicion: probe once, then either mark down or let
   *  the failure stand as request-specific. */
  private async confirmFailure(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reachable = await Promise.race([
      this.probe(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), CONFIRM_TIMEOUT_MS);
      }),
    ]);
    if (timer !== null) clearTimeout(timer);

    // A response that arrived while the suspicion was open already cleared
    // it through reportBackendResponse; nothing left to decide.
    if (!this.suspected) return;
    this.suspected = false;

    if (reachable) {
      this.emitSuspicion(false);
      return;
    }
    this.down = true;
    this.startProbe();
    this.emit();
    this.emitSuspicion(true);
  }

  private async probe(): Promise<boolean> {
    try {
      const response = await globalThis.fetch(`${BASE}/health`);
      // A reverse proxy in front of a dead backend RESOLVES the fetch with
      // a 502/503/504, so "it did not throw" is not proof of reachability
      // (#770). Classify the probe's own response exactly as guardedFetch
      // classifies an app request.
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

  private emitSuspicion(confirmedDown: boolean): void {
    for (const listener of this.suspicionListeners) {
      listener(confirmedDown);
    }
  }
}

export const backendReachability = new BackendReachability();
