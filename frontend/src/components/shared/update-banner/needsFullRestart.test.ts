import { afterEach, describe, expect, it } from "vitest";

import { needsFullRestartToUpdate } from "./needsFullRestart";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const IPADOS_MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36";
const DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";

const originalMatchMedia = window.matchMedia;

function setEnv(env: {
  ua: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  displayStandalone?: boolean;
}): void {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: env.ua });
  Object.defineProperty(navigator, "maxTouchPoints", {
    configurable: true,
    value: env.maxTouchPoints ?? 0,
  });
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value: env.standalone,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("standalone") ? Boolean(env.displayStandalone) : false,
    }),
  });
}

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

describe("needsFullRestartToUpdate", () => {
  it("is true for an installed iPhone PWA (navigator.standalone)", () => {
    setEnv({ ua: IPHONE_UA, standalone: true });
    expect(needsFullRestartToUpdate()).toBe(true);
  });

  it("is false for iPhone Safari (not standalone)", () => {
    setEnv({ ua: IPHONE_UA, standalone: false, displayStandalone: false });
    expect(needsFullRestartToUpdate()).toBe(false);
  });

  it("is true for an installed iPadOS PWA reporting a Macintosh UA + touch", () => {
    setEnv({ ua: IPADOS_MAC_UA, maxTouchPoints: 5, displayStandalone: true });
    expect(needsFullRestartToUpdate()).toBe(true);
  });

  it("is false for a touchless desktop, even when installed (display-mode standalone)", () => {
    setEnv({ ua: DESKTOP_UA, maxTouchPoints: 0, displayStandalone: true });
    expect(needsFullRestartToUpdate()).toBe(false);
  });

  it("is false for an installed Android PWA (reload activates the worker there)", () => {
    setEnv({ ua: ANDROID_UA, maxTouchPoints: 5, displayStandalone: true });
    expect(needsFullRestartToUpdate()).toBe(false);
  });

  it("is false for an iPhone browser with no standalone signal at all", () => {
    setEnv({ ua: IPHONE_UA, standalone: undefined, displayStandalone: false });
    expect(needsFullRestartToUpdate()).toBe(false);
  });
});
