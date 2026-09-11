import { useSyncExternalStore } from "react";

import { backendReachability } from "../../api/backendReachability";

/**
 * React surface over the backend-reachability store (#765).
 *
 * Returns true while the backend is unreachable (network-level fetch
 * failures reported by `guardedFetch`); flips back on the next
 * received response or successful probe.
 *
 * @example
 * const backendDown = useBackendReachability();
 * if (backendDown) return <BackendUnreachableBanner />;
 */
export function useBackendReachability(): boolean {
  return useSyncExternalStore(
    (listener) => backendReachability.subscribe(listener),
    () => backendReachability.isDown(),
    () => false,
  );
}
