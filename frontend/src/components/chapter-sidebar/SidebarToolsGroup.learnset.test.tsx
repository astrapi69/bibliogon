/**
 * Learnset-export entry in the sidebar tools group (#763).
 *
 * Pins the optional-handler contract: the button renders and fires
 * only when `onExportLearnset` is passed (the BookEditor withholds it
 * when the desktop-only feature gate resolves inactive), and is
 * absent otherwise - never a dead disabled control.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SidebarToolsGroup from "./SidebarToolsGroup";

const translate = (_key: string, fallback: string) => fallback;

function renderToolsGroup(onExportLearnset?: () => void) {
  localStorage.setItem("bibliogon.sidebar_tools_open", "1");
  return render(
    <SidebarToolsGroup
      chapters={[]}
      hasToc={false}
      t={translate}
      onExportLearnset={onExportLearnset}
    />,
  );
}

describe("SidebarToolsGroup learnset export", () => {
  it("renders the button and fires the handler when provided", () => {
    const onExportLearnset = vi.fn();
    renderToolsGroup(onExportLearnset);
    const button = screen.getByTestId("sidebar-export-learnset");
    fireEvent.click(button);
    expect(onExportLearnset).toHaveBeenCalledTimes(1);
  });

  it("renders no learnset button without a handler", () => {
    renderToolsGroup(undefined);
    expect(screen.queryByTestId("sidebar-export-learnset")).toBeNull();
  });
});
