/**
 * Backup-export trigger shared by the Books and Articles dashboards
 * (#771, RCU: both surfaces ran the identical handler).
 *
 * The server builds the whole .bgb before the first byte (measured:
 * 22 s / 987 MB on a 43-book library), so the click MUST acknowledge
 * itself immediately - previously a blank _blank tab was the only
 * feedback for the entire build.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useBackupExport } from "./useBackupExport";
import { notify } from "../../utils/platform/notify";
import { downloadFromUrl } from "../../shared/utils/downloadFromUrl";

vi.mock("../../shared/utils/downloadFromUrl", () => ({
  downloadFromUrl: vi.fn(),
}));

vi.mock("../../utils/platform/notify", () => ({
  notify: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock("../useI18n", () => ({
  useI18n: () => ({
    t: (_key: string, fallback: string) => fallback,
    lang: "de",
    setLang: () => {},
  }),
}));

describe("useBackupExport", () => {
  beforeEach(() => {
    vi.mocked(downloadFromUrl).mockClear();
    vi.mocked(notify.info).mockClear();
  });

  it("acknowledges the click before the download starts", () => {
    const { result } = renderHook(() => useBackupExport(false));
    act(() => {
      result.current();
    });
    expect(notify.info).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(notify.info).mock.calls[0][0])).toMatch(/Backup/i);
  });

  it("triggers a same-tab download of the backup URL", () => {
    const { result } = renderHook(() => useBackupExport(false));
    act(() => {
      result.current();
    });
    expect(downloadFromUrl).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(downloadFromUrl).mock.calls[0][0])).toContain(
      "/backup/export",
    );
  });

  it("does nothing while offline", () => {
    const { result } = renderHook(() => useBackupExport(true));
    act(() => {
      result.current();
    });
    expect(downloadFromUrl).not.toHaveBeenCalled();
    expect(notify.info).not.toHaveBeenCalled();
  });
});
