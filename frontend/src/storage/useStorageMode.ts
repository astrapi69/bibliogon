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
import { OFFLINE_ENABLED_EVENT } from "./connectivity";
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
    // Subscribe UNCONDITIONALLY so that enabling offline mid-session
    // (the take-offline path starts the monitor) is observed here
    // without a remount, so the reconnect drain (onReconnect) still
    // fires. The subscription is inert until connectivity.start() runs,
    // so desktop (offline never enabled) sees no monitor + no probing +
    // online stays true + mode stays "api" — the desktop path is
    // unaffected.
    const unsubscribe = connectivity.subscribe((next) => {
      if (!prevOnline.current && next) onReconnectRef.current?.();
      prevOnline.current = next;
      setOnline(next);
    });
    // Preload the queueing DexieStorage + start the connectivity monitor.
    // Both are idempotent. Done at mount when offline is already enabled,
    // AND on the OFFLINE_ENABLED_EVENT so taking a book offline mid-session
    // (long after this hook mounted with offlineEnabled=false) still starts
    // the monitor — otherwise connectivity never flips, getStorage() stays
    // on the API path, and offline edits are lost.
    const activate = () => {
      void ensureDexieStorageLoaded();
      connectivity.start();
    };
    if (offlineEnabled) activate();
    window.addEventListener(OFFLINE_ENABLED_EVENT, activate);
    setOnline(connectivity.isOnline());
    return () => {
      unsubscribe();
      window.removeEventListener(OFFLINE_ENABLED_EVENT, activate);
    };
  }, [offlineEnabled]);

  return { mode: resolveStorageMode(), online, offlineEnabled };
}
