import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import ImageDropZone from "./ImageDropZone";

function fileDrag(types: string[], files: File[]) {
  return { dataTransfer: { types, files } };
}

function imageFile(name: string, type = "image/png") {
  return new File(["x"], name, { type });
}

describe("ImageDropZone", () => {
  it("shows the overlay while a file is dragged over and hides on drop", () => {
    const onDropImage = vi.fn();
    render(
      <ImageDropZone onDropImage={onDropImage} overlayLabel="Drop image here">
        <div>content</div>
      </ImageDropZone>,
    );
    const zone = screen.getByTestId("image-dropzone");
    expect(screen.queryByTestId("image-dropzone-overlay")).toBeNull();

    fireEvent.dragEnter(zone, fileDrag(["Files"], []));
    expect(screen.getByTestId("image-dropzone-overlay").textContent).toContain(
      "Drop image here",
    );

    fireEvent.drop(zone, fileDrag(["Files"], [imageFile("a.png")]));
    expect(screen.queryByTestId("image-dropzone-overlay")).toBeNull();
    expect(onDropImage).toHaveBeenCalledTimes(1);
    expect(onDropImage.mock.calls[0][0].name).toBe("a.png");
  });

  it("ignores non-file drags (e.g. text / element)", () => {
    const onDropImage = vi.fn();
    render(
      <ImageDropZone onDropImage={onDropImage}>
        <div>content</div>
      </ImageDropZone>,
    );
    const zone = screen.getByTestId("image-dropzone");
    fireEvent.dragEnter(zone, fileDrag(["text/plain"], []));
    expect(screen.queryByTestId("image-dropzone-overlay")).toBeNull();
  });

  it("ignores a dropped non-image file (no callback)", () => {
    const onDropImage = vi.fn();
    render(
      <ImageDropZone onDropImage={onDropImage}>
        <div>content</div>
      </ImageDropZone>,
    );
    const zone = screen.getByTestId("image-dropzone");
    const notImage = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(zone, fileDrag(["Files"], [notImage]));
    expect(onDropImage).not.toHaveBeenCalled();
  });

  it("takes only the FIRST image when several files are dropped", () => {
    const onDropImage = vi.fn();
    render(
      <ImageDropZone onDropImage={onDropImage}>
        <div>content</div>
      </ImageDropZone>,
    );
    const zone = screen.getByTestId("image-dropzone");
    fireEvent.drop(
      zone,
      fileDrag(["Files"], [
        new File(["x"], "skip.txt", { type: "text/plain" }),
        imageFile("first.png"),
        imageFile("second.jpg", "image/jpeg"),
      ]),
    );
    expect(onDropImage).toHaveBeenCalledTimes(1);
    expect(onDropImage.mock.calls[0][0].name).toBe("first.png");
  });

  it("does nothing when disabled", () => {
    const onDropImage = vi.fn();
    render(
      <ImageDropZone onDropImage={onDropImage} disabled>
        <div>content</div>
      </ImageDropZone>,
    );
    const zone = screen.getByTestId("image-dropzone");
    fireEvent.dragEnter(zone, fileDrag(["Files"], []));
    expect(screen.queryByTestId("image-dropzone-overlay")).toBeNull();
    fireEvent.drop(zone, fileDrag(["Files"], [imageFile("a.png")]));
    expect(onDropImage).not.toHaveBeenCalled();
  });

  it("forwards className and style to the wrapper", () => {
    render(
      <ImageDropZone
        onDropImage={vi.fn()}
        className="h-full w-full"
        style={{ justifyContent: "flex-start" }}
        testId="custom-zone"
      >
        <div>content</div>
      </ImageDropZone>,
    );
    const zone = screen.getByTestId("custom-zone");
    expect(zone.className).toContain("h-full");
    expect(zone.getAttribute("style")).toContain("justify-content: flex-start");
  });
});
