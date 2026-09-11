/**
 * URL-download helper (#771).
 *
 * Sibling of downloadBlob for server-rendered downloads: the server
 * streams the file, so the browser never holds it in memory (the
 * .bgb full backup is ~1 GB on a real library).
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import { downloadFromUrl } from "./downloadFromUrl";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("downloadFromUrl", () => {
  it("clicks a same-tab download anchor and removes it again", () => {
    const clicks: string[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = realCreate(tag);
      if (tag === "a") {
        element.click = () => clicks.push((element as HTMLAnchorElement).href);
      }
      return element;
    });

    downloadFromUrl("/api/backup/export", "bibliogon-backup.bgb");

    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toContain("/api/backup/export");
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("sets the download attribute so no blank tab is opened", () => {
    let anchor: HTMLAnchorElement | null = null;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = realCreate(tag);
      if (tag === "a") {
        anchor = element as HTMLAnchorElement;
        element.click = () => {};
      }
      return element;
    });

    downloadFromUrl("/api/backup/export", "bibliogon-backup.bgb");

    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute("download")).toBe("bibliogon-backup.bgb");
    expect(anchor!.target).toBe("");
  });

  it("omits the filename when none is given (server decides)", () => {
    let anchor: HTMLAnchorElement | null = null;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = realCreate(tag);
      if (tag === "a") {
        anchor = element as HTMLAnchorElement;
        element.click = () => {};
      }
      return element;
    });

    downloadFromUrl("/api/backup/export");

    expect(anchor!.getAttribute("download")).toBe("");
  });
});
