import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import EditorStatusBar from "./EditorStatusBar";

describe("EditorStatusBar", () => {
  it("renders word count, reading time and character count with labels", () => {
    render(
      <EditorStatusBar
        wordCount={1234}
        readingTimeMin={5}
        charCount={7891}
        labels={{ words: "Wörter", readingTime: "Min Lesezeit", characters: "Zeichen" }}
      />,
    );
    expect(screen.getByTestId("status-words").textContent).toContain("Wörter");
    expect(screen.getByTestId("status-reading-time").textContent).toContain(
      "5 Min Lesezeit",
    );
    expect(screen.getByTestId("status-chars").textContent).toContain("Zeichen");
  });

  it("keeps reading time + chars in a sm-only (mobile-hidden) wrapper", () => {
    render(<EditorStatusBar wordCount={10} readingTimeMin={1} charCount={50} />);
    expect(screen.getByTestId("status-reading-time").className).toContain(
      "sm:inline",
    );
    expect(screen.getByTestId("status-chars").className).toContain("sm:inline");
    // The word count is always visible (no hidden class).
    expect(screen.getByTestId("status-words").className).not.toContain("hidden");
  });

  it("renders children appended after the counts", () => {
    render(
      <EditorStatusBar wordCount={1} readingTimeMin={1} charCount={1}>
        <span data-testid="extra">goal</span>
      </EditorStatusBar>,
    );
    expect(screen.getByTestId("extra")).toBeTruthy();
  });
});
