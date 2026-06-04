/**
 * useStorageMode — reactive storage-mode hook (mobile-sync Phase 3, C2).
 *
 * Exposes the effective storage mode + live connectivity to the UI (the
 * offline indicator, C9). It only activates the connectivity monitor
 * when offline capability is enabled — on the normal desktop the monitor
 * never starts, `online` stays true and `mode` stays `"api"`, so the
 * desktop is unaffected.
 *
 * On an offline -> online transition it preloads + calls the optional
 * `onReconnect` callback; C6 wires that to the background sync.
 */

import { useEffect, useRef, useState } from "react";

import {
  connectivity,
  ensureDexieStorageLoaded,
  isOfflineEnabled,
  resolveStorageMode,
} from "./index";
import type { StorageMode } from "./types";

export interface StorageModeState {
  /** Effective backend right now ("api" online, "dexie" offline). */
  mode: StorageMode;
  /** Whether the desktop backend is currently reachable. */
  online: boolean;
  /** Whether this client has offline capability switched on. */
  offlineEnabled: boolean;
}

export function useStorageMode(opts?: {
  onReconnect?: () => void;
}): StorageModeState {
  const offlineEnabled = isOfflineEnabled();
  const [online, setOnline] = useState<boolean>(() => connectivity.isOnline());

  // Keep the latest onReconnect without re-subscribing every render.
  const onReconnectRef = useRef(opts?.onReconnect);
  onReconnectRef.current = opts?.onReconnect;
  const prevOnline = useRef(connectivity.isOnline());

  useEffect(() => {
    if (!offlineEnabled) return; // desktop: never monitor, never preload
    void ensureDexieStorageLoaded(); // ready before we ever go offline
    connectivity.start();
    const unsubscribe = connectivity.subscribe((next) => {
      if (!prevOnline.current && next) onReconnectRef.current?.();
      prevOnline.current = next;
      setOnline(next);
    });
    setOnline(connectivity.isOnline());
    return unsubscribe;
  }, [offlineEnabled]);

  return { mode: resolveStorageMode(), online, offlineEnabled };
}
