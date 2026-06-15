import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import FleschScale, { fleschBand } from "./FleschScale";

describe("fleschBand", () => {
  it("maps scores to bands at the boundaries", () => {
    expect(fleschBand(80)).toBe("easy");
    expect(fleschBand(79.9)).toBe("readable");
    expect(fleschBand(60)).toBe("readable");
    expect(fleschBand(59.9)).toBe("demanding");
    expect(fleschBand(40)).toBe("demanding");
    expect(fleschBand(39.9)).toBe("academic");
  });
});

describe("FleschScale", () => {
  it("marks the band the score falls into", () => {
    render(<FleschScale score={58.6} />);
    const scale = screen.getByTestId("flesch-scale");
    expect(scale.getAttribute("data-band")).toBe("demanding");
    expect(screen.getByTestId("flesch-marker").textContent).toContain("58.6");
  });

  it("renders the genre comparison line with all four benchmarks", () => {
    render(<FleschScale score={70} />);
    const text = screen.getByTestId("flesch-scale").textContent ?? "";
    expect(text).toContain("~70");
    expect(text).toContain("~55");
    expect(text).toContain("~35");
    expect(text).toContain("~85");
  });

  it("applies custom labels", () => {
    render(
      <FleschScale
        score={90}
        labels={{ bands: { easy: "Leicht" }, yourBook: "Ihr Buch" }}
      />,
    );
    expect(screen.getByText("Leicht")).toBeTruthy();
    expect(screen.getByTestId("flesch-marker").textContent).toContain(
      "Ihr Buch",
    );
  });
});
