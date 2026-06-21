/**
 * Tests for NextUpdateCheck (#477 Phase 2): the Settings > About
 * "next automatic check" line. Uses the real formatRelativeTime; mocks
 * only i18n (t returns the fallback so {time} substitution is observable).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { NextUpdateCheck } from "./NextUpdateCheck";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}));

describe("NextUpdateCheck", () => {
  it("shows the disabled note when auto-check is off", () => {
    render(<NextUpdateCheck updates={{ auto_check: false, check_interval: "daily" }} />);
    expect(screen.getByTestId("about-next-check").textContent).toContain(
      "Automatische Prüfung deaktiviert",
    );
  });

  it("shows the disabled note when the interval is 'never'", () => {
    render(<NextUpdateCheck updates={{ auto_check: true, check_interval: "never" }} />);
    expect(screen.getByTestId("about-next-check").textContent).toContain(
      "Automatische Prüfung deaktiviert",
    );
  });

  it("shows a future relative time when auto-check is on", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    render(
      <NextUpdateCheck
        updates={{
          auto_check: true,
          check_interval: "daily",
          last_check_at: oneHourAgo,
        }}
      />,
    );
    const text = screen.getByTestId("about-next-check").textContent ?? "";
    expect(text).toContain("Nächste automatische Prüfung:");
    // daily interval, last check 1h ago -> next ~23h in the future.
    expect(text).toMatch(/in \d+ hours?/);
  });

  it("treats a never-checked state as due now (no crash on null)", () => {
    render(
      <NextUpdateCheck
        updates={{ auto_check: true, check_interval: "weekly", last_check_at: null }}
      />,
    );
    expect(screen.getByTestId("about-next-check").textContent).toContain(
      "Nächste automatische Prüfung:",
    );
  });

  it("defaults to enabled (daily) when the updates block is missing", () => {
    render(<NextUpdateCheck updates={undefined} />);
    expect(screen.getByTestId("about-next-check").textContent).toContain(
      "Nächste automatische Prüfung:",
    );
  });
});
