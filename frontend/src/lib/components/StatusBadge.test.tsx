import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import StatusBadge from "./StatusBadge";

const LABELS = {
  draft: "Entwurf",
  ready: "Bereit",
  published: "Veröffentlicht",
  archived: "Archiviert",
};

describe("StatusBadge", () => {
  it("renders the localized label for the status", () => {
    render(<StatusBadge status="published" labels={LABELS} testId="sb" />);
    expect(screen.getByTestId("sb").textContent).toBe("Veröffentlicht");
  });

  it("maps each lifecycle status to a distinct badge variant", () => {
    const cases: Array<[string, string]> = [
      ["draft", "badge-default"],
      ["ready", "badge-info"],
      ["published", "badge-success"],
      ["archived", "badge-muted"],
    ];
    for (const [status, cls] of cases) {
      const { unmount } = render(
        <StatusBadge status={status} labels={LABELS} testId={`sb-${status}`} />,
      );
      expect(screen.getByTestId(`sb-${status}`).className).toContain(cls);
      unmount();
    }
  });

  it("falls back to the raw status when no label is provided", () => {
    render(<StatusBadge status="weird" labels={{}} testId="sb" />);
    expect(screen.getByTestId("sb").textContent).toBe("weird");
  });

  it("honours a variantMap override", () => {
    render(
      <StatusBadge
        status="draft"
        labels={LABELS}
        variantMap={{ draft: "danger" }}
        testId="sb"
      />,
    );
    expect(screen.getByTestId("sb").className).toContain("badge-danger");
  });
});
