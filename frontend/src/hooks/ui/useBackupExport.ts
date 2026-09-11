import { useCallback } from "react";

import { api } from "../../api/client";
import { useI18n } from "../useI18n";
import { notify } from "../../utils/platform/notify";
import { downloadFromUrl } from "../../shared/utils/downloadFromUrl";

/**
 * Shared full-backup (`.bgb`) export trigger for the Books and
 * Articles dashboards (#771).
 *
 * Both dashboards previously ran the identical
 * `window.open(exportUrl, "_blank")` handler. The backend assembles
 * the entire archive before sending a single byte - measured at 22 s
 * for a 987 MB / 43-book library - so that blank tab was the user's
 * only feedback for the whole build and read as a failure.
 *
 * This hook acknowledges the click immediately and downloads in the
 * same tab, letting the browser's download manager show the transfer.
 *
 * @param offline - When true the action is a no-op (the backend-only
 *   backup surface is gated offline by the caller's feature state).
 * @returns The click handler.
 *
 * @example
 * ```tsx
 * const handleBackupExport = useBackupExport(offline);
 * <button onClick={handleBackupExport}>Backup</button>
 * ```
 */
export function useBackupExport(offline: boolean): () => void {
  const { t } = useI18n();

  return useCallback(() => {
    if (offline) return;
    notify.info(
      t(
        "ui.dashboard.backup_preparing",
        "Backup wird erstellt. Der Download startet automatisch, sobald das Archiv fertig ist - bei großen Bibliotheken dauert das länger.",
      ),
    );
    downloadFromUrl(api.backup.exportUrl());
    // `t` is intentionally out of the deps: the i18n mock returns a
    // fresh function per render, which would recreate the handler on
    // every parent render (lessons-learned "useEffect deps + i18n").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);
}
