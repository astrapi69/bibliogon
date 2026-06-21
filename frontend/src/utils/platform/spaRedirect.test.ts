import {describe, it, expect, vi} from "vitest";
import {restoreSpaRedirect} from "./spaRedirect";

function makeHistory() {
  const calls: Array<[unknown, string, string | undefined]> = [];
  const hist = {
    replaceState: vi.fn((state: unknown, _unused: string, url?: string) => {
      calls.push([state, _unused, url]);
    }),
  };
  return {hist, calls};
}

describe("restoreSpaRedirect", () => {
  it("rewrites a sub-path basename + route", () => {
    const {hist} = makeHistory();
    const target = restoreSpaRedirect(
      "/bibliogon",
      {search: "?redirect=%2Fbooks%2F123"},
      hist,
    );
    expect(target).toBe("/bibliogon/books/123");
    expect(hist.replaceState).toHaveBeenCalledWith(null, "", "/bibliogon/books/123");
  });

  it("preserves query + hash carried in the redirect value", () => {
    const {hist} = makeHistory();
    const target = restoreSpaRedirect(
      "/bibliogon",
      {search: "?redirect=" + encodeURIComponent("/articles/new?type=tutorial#x")},
      hist,
    );
    expect(target).toBe("/bibliogon/articles/new?type=tutorial#x");
  });

  it("uses no prefix for the root basename", () => {
    const {hist} = makeHistory();
    const target = restoreSpaRedirect("/", {search: "?redirect=%2Fbooks"}, hist);
    expect(target).toBe("/books");
    expect(hist.replaceState).toHaveBeenCalledWith(null, "", "/books");
  });

  it("is a no-op when there is no redirect param", () => {
    const {hist} = makeHistory();
    const target = restoreSpaRedirect("/bibliogon", {search: ""}, hist);
    expect(target).toBeNull();
    expect(hist.replaceState).not.toHaveBeenCalled();
  });

  it("rejects a non-'/'-relative redirect value", () => {
    const {hist} = makeHistory();
    expect(
      restoreSpaRedirect(
        "/bibliogon",
        {search: "?redirect=" + encodeURIComponent("https://evil.example")},
        hist,
      ),
    ).toBeNull();
    expect(hist.replaceState).not.toHaveBeenCalled();
  });

  it("rejects a protocol-relative '//' redirect (open-redirect guard)", () => {
    const {hist} = makeHistory();
    expect(
      restoreSpaRedirect(
        "/bibliogon",
        {search: "?redirect=" + encodeURIComponent("//evil.example")},
        hist,
      ),
    ).toBeNull();
    expect(hist.replaceState).not.toHaveBeenCalled();
  });
});
