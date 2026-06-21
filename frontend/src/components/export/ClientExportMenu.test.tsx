/**
 * ClientExportMenu — trigger-render contract.
 *
 * Per the lessons-learned "Radix DropdownMenu + happy-dom is brittle" rule,
 * the portal menu items are exercised in the E2E, not here; this pins the
 * trigger's testid + accessible label + disabled wiring. The actual format
 * generation is covered by the export engine's own tests (export/*.test.ts).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import ClientExportMenu from "./ClientExportMenu";
import type { ExportDocument } from "../../export";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({ t: (_k: string, fb: string) => fb, lang: "de", setLang: vi.fn() }),
}));

vi.mock("@astrapi69/feature-strategy-react", () => ({
  useFeature: () => ({ isActive: true }),
}));

const DOC: ExportDocument = { title: "T", sections: [] };

describe("ClientExportMenu", () => {
  it("renders the export trigger with its accessible label", () => {
    render(<ClientExportMenu getDocument={() => DOC} />);
    const trigger = screen.getByTestId("client-export-trigger");
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-label")).toBe("Exportieren");
  });

  it("honours a custom testId and the disabled prop", () => {
    render(<ClientExportMenu getDocument={() => DOC} disabled testId="x-export" />);
    const trigger = screen.getByTestId("x-export") as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });
});
