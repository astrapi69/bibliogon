/**
 * First-install data-migration welcome dialog (#591).
 *
 * Shown once on the first start of a fresh install (no books and no
 * articles) to offer importing a `.bgb` full backup created on the online
 * (GitHub Pages / Dexie) version. Mirrors the `DonationOnboardingDialog`
 * pattern: a Radix Dialog + a localStorage "offered" flag, so it shows at
 * most once per machine and never blocks render.
 *
 * Works in both storage modes (the reverse API->Dexie migration case is
 * equally valid): the parent wires "Backup importieren" to the
 * mode-appropriate import dialog (ImportWizardModal / OfflineImportDialog),
 * so this component contains no import logic of its own.
 */

import * as Dialog from "@radix-ui/react-dialog";
import { Download, ExternalLink, X } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";

/** Public online (GitHub Pages) build the user can export a `.bgb` from. */
export const ONLINE_VERSION_URL = "https://astrapi69.github.io/bibliogon/";

export const MIGRATION_OFFERED_KEY = "bibliogon-migration-offered";

/** True when the migration dialog has not yet been offered + dismissed. */
export function shouldOfferMigration(): boolean {
    try {
        return localStorage.getItem(MIGRATION_OFFERED_KEY) !== "true";
    } catch {
        return false;
    }
}

/** Persist that the migration dialog was shown so it never reappears. */
export function markMigrationOffered(): void {
    try {
        localStorage.setItem(MIGRATION_OFFERED_KEY, "true");
    } catch {
        /* no-op: storage rejected, still close cleanly */
    }
}

interface Props {
    open: boolean;
    /** Dismiss ("Ohne Daten starten" / close-X / Escape). The flag is set
     *  by this component before the callback fires. */
    onClose: () => void;
    /** "Backup importieren": open the parent's import dialog. The flag is
     *  NOT set here — the dialog should reappear if the user cancels the
     *  import without bringing data over. */
    onImport: () => void;
}

export default function MigrationWelcomeDialog({ open, onClose, onImport }: Props) {
    const { t } = useI18n();

    const handleDismiss = () => {
        markMigrationOffered();
        onClose();
    };

    const steps = [
        t("ui.migration.step_open", "Öffne die Online-Version."),
        t("ui.migration.step_settings", "Gehe zu Einstellungen → Daten → Vollbackup (.bgb)."),
        t("ui.migration.step_download", "Lade die .bgb-Datei herunter."),
        t("ui.migration.step_import", 'Klicke hier auf "Backup importieren".'),
    ];

    return (
        <Dialog.Root open={open} onOpenChange={(o) => !o && handleDismiss()}>
            <Dialog.Portal>
                <Dialog.Overlay className="radix-dialog-overlay" />
                <Dialog.Content
                    className="radix-dialog-content w-[min(92vw,520px)] p-6"
                    data-testid="migration-welcome-dialog"
                    aria-describedby="migration-welcome-desc"
                >
                    <div className="flex items-start justify-between gap-3">
                        <Dialog.Title className="text-lg font-semibold text-foreground">
                            {t("ui.migration.title", "Willkommen bei Bibliogon")}
                        </Dialog.Title>
                        <button
                            className="btn-icon"
                            onClick={handleDismiss}
                            data-testid="migration-welcome-close"
                            aria-label={t("ui.common.close", "Schließen")}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <Dialog.Description
                        id="migration-welcome-desc"
                        className="mt-2 text-sm text-muted"
                    >
                        {t(
                            "ui.migration.intro",
                            "Hast du die App schon online genutzt? Deine Bücher und Artikel können übernommen werden.",
                        )}
                    </Dialog.Description>

                    <ol
                        className="mt-4 flex list-decimal flex-col gap-1 pl-5 text-sm text-foreground"
                        data-testid="migration-welcome-steps"
                    >
                        {steps.map((step, i) => (
                            <li key={i}>{step}</li>
                        ))}
                    </ol>

                    <div className="mt-6 flex flex-wrap justify-end gap-2">
                        <button
                            className="btn btn-secondary min-h-[44px]"
                            onClick={handleDismiss}
                            data-testid="migration-welcome-skip"
                        >
                            {t("ui.migration.skip", "Ohne Daten starten")}
                        </button>
                        <a
                            className="btn btn-secondary min-h-[44px]"
                            href={ONLINE_VERSION_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="migration-welcome-open-online"
                        >
                            <ExternalLink size={16} />
                            {t("ui.migration.open_online", "Online-Version öffnen")}
                        </a>
                        <button
                            className="btn btn-primary min-h-[44px]"
                            onClick={onImport}
                            data-testid="migration-welcome-import"
                        >
                            <Download size={16} />
                            {t("ui.migration.import", "Backup importieren")}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
