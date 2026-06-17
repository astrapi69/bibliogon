import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "./downloadBlob";

describe("downloadBlob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an object URL, clicks a download anchor, and revokes the URL", () => {
    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");
    const revokeSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    const blob = new Blob(["hello"], { type: "text/plain" });
    downloadBlob(blob, "greeting.txt");

    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
    expect(document.body.querySelector("a")).toBeNull();
  });

  it("sets href and download attributes on the anchor before clicking", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    let capturedHref = "";
    let capturedDownload = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        capturedHref = this.href;
        capturedDownload = this.download;
      },
    );

    downloadBlob(new Blob(["x"]), "file.epub");

    expect(capturedHref).toContain("blob:mock-url");
    expect(capturedDownload).toBe("file.epub");
  });

  /** Capture the `download` attribute the anchor carried at click time. */
  function downloadAttrFor(filename: string): string {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    let captured = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        captured = this.download;
      },
    );
    downloadBlob(new Blob(["x"]), filename);
    return captured;
  }

  it("falls back to 'download' when the filename is empty or blank (#388)", () => {
    expect(downloadAttrFor("")).toBe("download");
    expect(downloadAttrFor("   ")).toBe("download");
  });

  it("preserves special characters in the filename (umlauts + spaces)", () => {
    expect(downloadAttrFor("Mein Büchlein — Übersicht.pdf")).toBe(
      "Mein Büchlein — Übersicht.pdf",
    );
  });

  it("downloads a large blob (>10MB) through one object URL, then revokes it", () => {
    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");
    const revokeSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );

    const big = new Blob([new Uint8Array(11 * 1024 * 1024)], {
      type: "application/zip",
    });
    downloadBlob(big, "big-backup.bgb");

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(big);
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
    expect(document.body.querySelector("a")).toBeNull();
  });
});
