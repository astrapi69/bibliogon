/**
 * Regression pins for the APP_SHORTCUTS cheatsheet registry that the
 * /help/shortcuts page renders. The table must stay reconciled to the
 * shortcuts actually bound in the app — the three app-level toggles
 * (Ctrl+Shift+F fullscreen, Ctrl+Shift+D composition mode, Esc exit)
 * were missing before issue #310.
 */

import {describe, it, expect} from "vitest";
import {APP_SHORTCUTS} from "./useKeyboardShortcuts";

describe("APP_SHORTCUTS cheatsheet registry", () => {
  const keysFor = (combo: string) =>
    APP_SHORTCUTS.find((s) => s.keys.toLowerCase() === combo.toLowerCase());

  it("lists the fullscreen toggle (Ctrl+Shift+F)", () => {
    const row = keysFor("Ctrl+Shift+F");
    expect(row).toBeDefined();
    expect(row?.labelKey).toBe("ui.shortcuts.fullscreen");
  });

  it("lists the composition-mode toggle (Ctrl+Shift+D)", () => {
    const row = keysFor("Ctrl+Shift+D");
    expect(row).toBeDefined();
    expect(row?.labelKey).toBe("ui.shortcuts.composition_mode");
  });

  it("lists the Esc exit affordance", () => {
    const row = keysFor("Esc");
    expect(row).toBeDefined();
    expect(row?.labelKey).toBe("ui.shortcuts.exit");
  });

  it("keeps the existing app + editor shortcuts", () => {
    expect(keysFor("Ctrl+/")).toBeDefined();
    expect(keysFor("Alt+Z")).toBeDefined();
    expect(keysFor("Ctrl+H")).toBeDefined();
    expect(keysFor("Ctrl+B")).toBeDefined();
  });

  it("does not invent an unbound Ctrl+S save shortcut", () => {
    expect(keysFor("Ctrl+S")).toBeUndefined();
  });

  it("every row carries a label key under ui.shortcuts", () => {
    for (const row of APP_SHORTCUTS) {
      expect(row.labelKey.startsWith("ui.shortcuts.")).toBe(true);
      expect(row.labelFallback.length).toBeGreaterThan(0);
    }
  });
});
