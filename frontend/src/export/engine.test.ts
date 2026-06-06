/**
 * Export-engine resolver tests (export-engine chooser).
 */

import { describe, it, expect } from "vitest";

import {
  asExportEngine,
  isExportEngine,
  shouldUseClientEngine,
} from "./engine";

describe("asExportEngine", () => {
  it("passes through valid values", () => {
    expect(asExportEngine("auto")).toBe("auto");
    expect(asExportEngine("client")).toBe("client");
    expect(asExportEngine("backend")).toBe("backend");
  });

  it("defaults to auto for absent / malformed values", () => {
    expect(asExportEngine(undefined)).toBe("auto");
    expect(asExportEngine(null)).toBe("auto");
    expect(asExportEngine("nonsense")).toBe("auto");
    expect(asExportEngine(42)).toBe("auto");
  });
});

describe("isExportEngine", () => {
  it("narrows only the three valid strings", () => {
    expect(isExportEngine("auto")).toBe(true);
    expect(isExportEngine("client")).toBe(true);
    expect(isExportEngine("backend")).toBe(true);
    expect(isExportEngine("x")).toBe(false);
  });
});

describe("shouldUseClientEngine", () => {
  it("offline always uses the client (backend preference degrades)", () => {
    expect(shouldUseClientEngine("auto", true)).toBe(true);
    expect(shouldUseClientEngine("client", true)).toBe(true);
    expect(shouldUseClientEngine("backend", true)).toBe(true);
  });

  it("online honours the preference", () => {
    expect(shouldUseClientEngine("auto", false)).toBe(false);
    expect(shouldUseClientEngine("backend", false)).toBe(false);
    expect(shouldUseClientEngine("client", false)).toBe(true);
  });
});
