/**
 * Light render pins for EditorContextMenu (EDITOR-CONTEXT-MENU-01). The
 * menu items themselves open in a Radix ContextMenu portal on
 * right-click, which is happy-dom-brittle - their behaviour is unit-
 * tested in editorContextMenuActions.test and exercised live by the
 * E2E smoke. Here we only pin that the wrapper renders its children
 * (so the editor surface is never hidden) and passes through when no
 * editor is present.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import EditorContextMenu from "./EditorContextMenu";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, f: string) => f,
    lang: "en",
    setLang: vi.fn(),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeEditor = { chain: () => ({}), state: {}, storage: {} } as any;

describe("EditorContextMenu", () => {
  it("renders its children as the trigger when an editor is present", () => {
    render(
      <EditorContextMenu editor={fakeEditor}>
        <div data-testid="editor-surface">content</div>
      </EditorContextMenu>,
    );
    expect(screen.getByTestId("editor-surface")).toBeTruthy();
  });

  it("passes children through when there is no editor", () => {
    render(
      <EditorContextMenu editor={null}>
        <div data-testid="editor-surface">content</div>
      </EditorContextMenu>,
    );
    expect(screen.getByTestId("editor-surface")).toBeTruthy();
  });
});
