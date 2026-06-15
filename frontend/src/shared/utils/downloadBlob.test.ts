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
});
