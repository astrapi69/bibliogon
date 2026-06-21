/**
 * Tracks `navigator.onLine` and updates on the `online` / `offline`
 * window events. Returns the current boolean and, as a convenience,
 * a ref that consumers can use to bind "ran since last reconnect"
 * logic without re-registering handlers.
 */
import {useEffect, useState} from "react";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
