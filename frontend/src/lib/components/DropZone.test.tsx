import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import DropZone from "./DropZone";

function fileDrag(types: string[], files: File[]) {
  return {
    dataTransfer: {
      types,
      files,
    },
  };
}

function makeFile(name: string) {
  return new File(["x"], name, { type: "text/plain" });
}

describe("DropZone", () => {
  it("shows the overlay while a file is dragged over and hides on drop", () => {
    const onDrop = vi.fn();
    render(
      <DropZone onDrop={onDrop} overlayLabel="Drop here">
        <div>content</div>
      </DropZone>,
    );
    const zone = screen.getByTestId("dropzone");
    expect(screen.queryByTestId("dropzone-overlay")).toBeNull();

    fireEvent.dragEnter(zone, fileDrag(["Files"], []));
    expect(screen.getByTestId("dropzone-overlay").textContent).toContain(
      "Drop here",
    );

    fireEvent.drop(zone, fileDrag(["Files"], [makeFile("a.md")]));
    expect(screen.queryByTestId("dropzone-overlay")).toBeNull();
    expect(onDrop).toHaveBeenCalledWith([expect.any(File)]);
  });

  it("ignores non-file drags (e.g. text/element)", () => {
    const onDrop = vi.fn();
    render(
      <DropZone onDrop={onDrop}>
        <div>content</div>
      </DropZone>,
    );
    const zone = screen.getByTestId("dropzone");
    fireEvent.dragEnter(zone, fileDrag(["text/plain"], []));
    expect(screen.queryByTestId("dropzone-overlay")).toBeNull();
  });

  it("filters dropped files by the accept list", () => {
    const onDrop = vi.fn();
    render(
      <DropZone onDrop={onDrop} accept={[".md"]}>
        <div>content</div>
      </DropZone>,
    );
    const zone = screen.getByTestId("dropzone");
    fireEvent.drop(
      zone,
      fileDrag(["Files"], [makeFile("a.png"), makeFile("b.md")]),
    );
    expect(onDrop).toHaveBeenCalledTimes(1);
    const passed = onDrop.mock.calls[0][0] as File[];
    expect(passed).toHaveLength(1);
    expect(passed[0].name).toBe("b.md");
  });

  it("does nothing when disabled", () => {
    const onDrop = vi.fn();
    render(
      <DropZone onDrop={onDrop} disabled>
        <div>content</div>
      </DropZone>,
    );
    const zone = screen.getByTestId("dropzone");
    fireEvent.dragEnter(zone, fileDrag(["Files"], []));
    expect(screen.queryByTestId("dropzone-overlay")).toBeNull();
    fireEvent.drop(zone, fileDrag(["Files"], [makeFile("a.md")]));
    expect(onDrop).not.toHaveBeenCalled();
  });
});
