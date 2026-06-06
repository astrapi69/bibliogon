/**
 * Client Medium import — ZIP parse step tests (#34 P4 C1b).
 */

import { describe, it, expect } from "vitest";
import { strToU8, zipSync } from "fflate";

import { parseMediumZip } from "./clientImport";

function htmlPost(opts: {
  title: string;
  body: string;
  canonical: string;
}): string {
  return `<!doctype html><html><body><article class="h-entry">
    <header><h1 class="p-name">${opts.title}</h1></header>
    <section data-field="subtitle" class="p-summary"></section>
    <section data-field="body" class="e-content">
      <section class="section section--body">
        <div class="section-content">
          <div class="section-inner">${opts.body}</div>
        </div>
      </section>
    </section>
    <footer>
      <a class="p-author" href="#">Jane</a>
      <a class="p-canonical" href="${opts.canonical}">c</a>
      <time class="dt-published" datetime="2020-01-01T00:00:00.000Z">d</time>
    </footer>
  </article></body></html>`;
}

function zipFile(entries: Record<string, string>): File {
  const u8 = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([k, v]) => [k, strToU8(v)]),
    ),
  );
  // File from the zipped bytes (Blob-backed; .arrayBuffer() reads them back).
  return new File([u8], "medium-export.zip", { type: "application/zip" });
}

describe("parseMediumZip", () => {
  it("parses posts/*.html, classifies, ignores non-post files", async () => {
    const articleHtml = htmlPost({
      title: "Real Article",
      body:
        '<p class="graf graf--p">This is a full-length article body with enough words to be unambiguous prose. ' +
        "More sentences follow to clear the comment thresholds entirely.</p>" +
        '<h3 class="graf graf--h3">A heading</h3>',
      canonical: "https://medium.com/@jane/real-article-1",
    });
    const commentHtml = htmlPost({
      title: "Re: something",
      body: '<p class="graf graf--p">Thanks, great post!</p>',
      canonical: "https://medium.com/@jane/comment-2",
    });

    const file = zipFile({
      "posts/2020-01-01_Real-Article-1.html": articleHtml,
      "posts/2020-02-01_Comment-2.html": commentHtml,
      "profile/about.html": "<html><body>ignored</body></html>",
      "posts/": "", // directory entry, skipped
    });

    const { preview, parsed } = await parseMediumZip(file, 1_000);

    expect(preview.total_posts).toBe(2);
    expect(parsed.size).toBe(2);
    expect(preview.preview_id).toBeTruthy();
    expect(preview.expires_at).toBe(1_000 + 24 * 60 * 60 * 1000);

    const byTitle = Object.fromEntries(
      preview.items.map((i) => [i.title, i]),
    );
    expect(byTitle["Real Article"].classification).toBe("article");
    expect(byTitle["Real Article"].canonical_url).toBe(
      "https://medium.com/@jane/real-article-1",
    );
    expect(byTitle["Re: something"].classification).toBe("comment");
    // Comment rows carry a body preview; article rows do not.
    expect(byTitle["Re: something"].body_preview).toContain("Thanks");
    expect(byTitle["Real Article"].body_preview).toBe("");
  });

  it("records a per-post parse issue in errored without aborting", async () => {
    // A posts/*.html with no body section parses to an empty doc + a warning
    // rather than throwing, so it still lands as an item (warnings carried).
    const file = zipFile({
      "posts/ok.html": htmlPost({
        title: "OK",
        body: '<p class="graf graf--p">Body text that is long enough to be a normal article and not a comment at all here.</p>',
        canonical: "https://medium.com/@jane/ok",
      }),
      "posts/empty.html": "<html><body><article></article></body></html>",
    });
    const { preview } = await parseMediumZip(file, 0);
    expect(preview.total_posts).toBe(2);
    const empty = preview.items.find((i) => i.filename === "empty.html");
    expect(empty?.warnings).toContain("body section not found");
  });

  it("rejects a file that is not a ZIP", async () => {
    const bad = new File([strToU8("not a zip")], "x.zip");
    await expect(parseMediumZip(bad, 0)).rejects.toThrow(/ZIP/);
  });
});
