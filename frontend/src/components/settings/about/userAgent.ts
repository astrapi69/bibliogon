/**
 * Build-date + User-Agent formatting helpers for the Settings > About
 * sections. Extracted from AboutSettings.tsx (#675); `parseUserAgent`
 * stays re-exported from AboutSettings.tsx for its existing test import.
 */

/** Format the build-time ISO timestamp into a locale-aware string,
 *  falling back to the raw value if it is not a parseable date. */
export function formatBuildDate(iso: string, lang: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return parsed.toLocaleString(lang);
  } catch {
    return parsed.toLocaleString();
  }
}

/**
 * Parse a browser User-Agent string into a readable "OS · Browser
 * Version" label. Handles the common desktop + mobile platforms
 * (Windows, macOS, Linux, Android, iOS) and the common browsers
 * (Edge, Chrome, Firefox, Safari) with a version number. Falls
 * back to the raw User-Agent string when it cannot be parsed.
 *
 * @param ua - The raw navigator.userAgent string.
 * @returns A human-readable "OS · Browser Version" string, or the
 *   raw User-Agent when neither OS nor browser is recognised.
 */
export function parseUserAgent(ua: string): string {
  if (!ua) return ua;

  let os = "";
  if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/(iPhone|iPad|iPod)/.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser = "";
  let version = "";
  let match: RegExpMatchArray | null;
  if ((match = ua.match(/Edg(?:e|A|iOS)?\/(\d+(?:\.\d+)?)/))) {
    browser = "Edge";
    version = match[1];
  } else if ((match = ua.match(/Firefox\/(\d+(?:\.\d+)?)/))) {
    browser = "Firefox";
    version = match[1];
  } else if ((match = ua.match(/Chrome\/(\d+(?:\.\d+)?)/))) {
    browser = "Chrome";
    version = match[1];
  } else if ((match = ua.match(/Version\/(\d+(?:\.\d+)?).*Safari/))) {
    browser = "Safari";
    version = match[1];
  } else if (/Safari/.test(ua)) {
    browser = "Safari";
  }

  const browserPart = [browser, version].filter(Boolean).join(" ");
  const parts = [os, browserPart].filter(Boolean);
  if (parts.length === 0) return ua;
  return parts.join(" · ");
}
