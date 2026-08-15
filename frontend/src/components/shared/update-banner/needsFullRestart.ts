/**
 * Detect the environment that needs a FULL APP RESTART (not just a reload) to
 * activate a freshly-installed service worker.
 *
 * This is the iOS standalone-PWA quirk: on an installed iOS home-screen app
 * (WKWebView), `skipWaiting()` + `location.reload()` does NOT swap the active
 * worker — the old bundle keeps serving until the user fully closes and
 * reopens the app. Everywhere else (desktop, Android, a normal iOS Safari tab)
 * a reload activates the new worker, so the standard update flow is fine and
 * the hint stays hidden.
 *
 * Isolated on purpose: this hand-rolled detector exists ONLY until Bibliogon
 * adopts @astrapi69/pwa-update, whose `needsFullRestart` quirk supersedes it.
 * At that point delete this module plus its two banner call sites
 * (AppUpdateBanner + AppVersionUpdateBanner) — no other code depends on it.
 *
 * @example
 * if (needsFullRestartToUpdate()) showRestartHint();
 * else applyUpdate();
 */
export function needsFullRestartToUpdate(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }
  return isIos() && isStandalonePwa();
}

/**
 * True on an iPhone / iPod / iPad. iPadOS 13+ reports a desktop "Macintosh"
 * user agent, so a touch-capable "Mac" (maxTouchPoints > 1) is treated as an
 * iPad — the only Macs with a touch screen are iPads under the desktop UA.
 */
function isIos(): boolean {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  const touchPoints = navigator.maxTouchPoints;
  return /Macintosh/.test(ua) && typeof touchPoints === "number" && touchPoints > 1;
}

/** True when running as an installed standalone PWA (iOS `navigator.standalone`
 *  or the standard `display-mode: standalone` media query). */
function isStandalonePwa(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || displayStandalone;
}
