import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { getSearchState } from "prosemirror-search";

import { SearchAndReplace } from "./searchAndReplace";

let editor: Editor | null = null;

function makeEditor(html: string): Editor {
  editor = new Editor({
    extensions: [StarterKit, SearchAndReplace],
    content: html,
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("SearchAndReplace adapter", () => {
  it("setSearchTerm activates a prosemirror-search query", () => {
    const e = makeEditor("<p>foo bar foo</p>");
    e.commands.setSearchTerm("foo");
    expect(getSearchState(e.state)?.query.search).toBe("foo");
  });

  it("setReplaceTerm carries the replacement into the active query", () => {
    const e = makeEditor("<p>foo bar foo</p>");
    e.commands.setSearchTerm("foo");
    e.commands.setReplaceTerm("baz");
    expect(getSearchState(e.state)?.query.replace).toBe("baz");
  });

  it("replaceAll replaces every match", () => {
    const e = makeEditor("<p>foo bar foo</p>");
    e.commands.setSearchTerm("foo");
    e.commands.setReplaceTerm("baz");
    e.commands.replaceAll();
    expect(e.getText()).toBe("baz bar baz");
  });

  it("nextSearchResult returns a boolean (match navigation)", () => {
    const e = makeEditor("<p>alpha beta alpha</p>");
    e.commands.setSearchTerm("alpha");
    expect(typeof e.commands.nextSearchResult()).toBe("boolean");
  });

  it("storage tracks the current search + replace terms", () => {
    const e = makeEditor("<p>hello world</p>");
    e.commands.setSearchTerm("hello");
    e.commands.setReplaceTerm("hi");
    expect(e.storage.searchAndReplace.searchTerm).toBe("hello");
    expect(e.storage.searchAndReplace.replaceTerm).toBe("hi");
  });
});
