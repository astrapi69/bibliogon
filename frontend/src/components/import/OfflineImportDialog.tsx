/**
 * Unified import dialog (#76, #353).
 *
 * The Dexie-mode counterpart to the backend-orchestrated `ImportWizardModal`,
 * now a tabbed dialog that unifies every client-side import source behind one
 * surface with a consistent flow:
 *
 *  - **Datei** ({@link FileImportTab}): drop/pick a local file; the browser
 *    format detector routes Markdown / Text / HTML / JSON backup / Medium ZIP /
 *    `.bgb` automatically.
 *  - **Von GitHub** ({@link GitHubImportTab}): import from a GitHub repo via
 *    the REST API (no git binary), pick files, import them.
 *  - **Von URL** ({@link UrlImportTab}): fetch a single document from any URL.
 *
 * Every source imports through the `getStorage()` seam (zero `/api`), so it
 * works identically online and in the backendless PWA. The GitHub / URL tabs
 * need network and resolve to a "requires internet connection" notice when the
 * browser is offline (feature-strategy gate). All `offline-import-*` test ids
 * on the File tab are preserved.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { X } from "lucide-react";

import { useI18n } from "../../hooks/useI18n";
import type { ImportFileResult } from "../../import/importRouter";
import FileImportTab from "./FileImportTab";
import GitHubImportTab from "./GitHubImportTab";
import UrlImportTab from "./UrlImportTab";

export interface OfflineImportDialogProps {
    open: boolean;
    onClose: () => void;
    /** Called after a successful import so the caller can refresh its lists. */
    onImported?: (result?: ImportFileResult) => void;
    /** A file handed in by a drag-and-drop drop; auto-detected on open (#312). */
    initialFile?: File | null;
}

type ImportSource = "file" | "github" | "url";

const TAB_TRIGGER =
    "min-h-[44px] flex-1 rounded-none border-b-2 border-transparent px-3 py-2 text-sm font-medium " +
    "text-[var(--text-muted)] data-[state=active]:border-[var(--accent)] " +
    "data-[state=active]:text-[var(--text)]";

export default function OfflineImportDialog({
    open,
    onClose,
    onImported,
    initialFile,
}: OfflineImportDialogProps) {
    const { t } = useI18n();
    const [tab, setTab] = useState<ImportSource>("file");

    const handleClose = () => {
        setTab("file");
        onClose();
    };

    return (
        <Dialog.Root open={open} onOpenChange={(next) => !next && handleClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content
                    className="dialog-content"
                    data-testid="offline-import-dialog"
                    style={{ maxWidth: 560 }}
                    aria-describedby={undefined}
                >
                    <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                        <Dialog.Title className="m-0 text-lg font-semibold">
                            {t("ui.offline_import.title", "Importieren")}
                        </Dialog.Title>
                        <Dialog.Close asChild>
                            <button
                                className="btn-icon"
                                data-testid="offline-import-close"
                                aria-label={t("ui.common.close", "Schließen")}
                            >
                                <X size={18} />
                            </button>
                        </Dialog.Close>
                    </div>

                    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as ImportSource)}>
                        <Tabs.List
                            className="flex border-b border-[var(--border)]"
                            data-testid="offline-import-tabs"
                        >
                            <Tabs.Trigger
                                value="file"
                                className={TAB_TRIGGER}
                                data-testid="offline-import-tab-file"
                            >
                                {t("ui.offline_import.tab_file", "Datei")}
                            </Tabs.Trigger>
                            <Tabs.Trigger
                                value="github"
                                className={TAB_TRIGGER}
                                data-testid="offline-import-tab-github"
                            >
                                {t("ui.offline_import.tab_github", "Von GitHub")}
                            </Tabs.Trigger>
                            <Tabs.Trigger
                                value="url"
                                className={TAB_TRIGGER}
                                data-testid="offline-import-tab-url"
                            >
                                {t("ui.offline_import.tab_url", "Von URL")}
                            </Tabs.Trigger>
                        </Tabs.List>

                        <Tabs.Content value="file">
                            <FileImportTab
                                open={open && tab === "file"}
                                initialFile={initialFile}
                                onImported={(result) => onImported?.(result)}
                                onClose={handleClose}
                            />
                        </Tabs.Content>
                        <Tabs.Content value="github">
                            <GitHubImportTab
                                onImported={() => onImported?.()}
                                onClose={handleClose}
                            />
                        </Tabs.Content>
                        <Tabs.Content value="url">
                            <UrlImportTab onImported={() => onImported?.()} onClose={handleClose} />
                        </Tabs.Content>
                    </Tabs.Root>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
