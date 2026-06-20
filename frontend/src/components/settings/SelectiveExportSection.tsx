/**
 * Settings > Backups — selective data export (#247).
 *
 * Lets the user pick which data sections to export into a single JSON
 * backup bundle. The output envelope is identical to the full backup
 * ({@link exportFullBackup}), so a selective export imports through the
 * same ``importFullBackup`` / import-wizard ``json-backup`` path; only the
 * selected sections are populated and the importer skips the rest.
 *
 * Every read goes through the storage seam, so the export works offline
 * (Dexie) exactly as online (API) — gated ALWAYS_ACTIVE via
 * {@link FEATURES.SELECTIVE_EXPORT}.
 *
 * Each checkbox maps one-to-one onto a section the backup bundle actually
 * carries. Comic panels, picture-book pages, comments, and publications are
 * deliberately absent: the bundle does not transport them (mirroring the
 * full backup), so a checkbox for them would write nothing.
 *
 * Testid namespace: ``selective-export-*``.
 */

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../../features/featureConfig";
import { notify } from "../../utils/platform/notify";
import { downloadBlob } from "../../export/download";
import {
    EMPTY_SELECTION,
    FULL_SELECTION,
    hasAnySelection,
    type ExportSelection,
} from "../../export/selectiveExport";
import { exportSelectiveBgb, selectiveBgbFilename, type BgbProgress } from "../../export/bgbExport";
import { BgbExportProgress } from "./BgbExportProgress";

interface ExportItemDef {
    key: keyof ExportSelection;
    labelKey: string;
    labelFallback: string;
}

interface ExportGroupDef {
    titleKey: string;
    titleFallback: string;
    items: ExportItemDef[];
}

const GROUPS: ExportGroupDef[] = [
    {
        titleKey: "ui.selective_export.group_content",
        titleFallback: "Inhalte",
        items: [
            {
                key: "books",
                labelKey: "ui.selective_export.item_books",
                labelFallback: "Bücher (mit Kapiteln, Metadaten)",
            },
            {
                key: "articles",
                labelKey: "ui.selective_export.item_articles",
                labelFallback: "Artikel",
            },
        ],
    },
    {
        titleKey: "ui.selective_export.group_master",
        titleFallback: "Stammdaten",
        items: [
            {
                key: "authors",
                labelKey: "ui.selective_export.item_authors",
                labelFallback: "Autoren / Pseudonyme",
            },
            {
                key: "chapterLabels",
                labelKey: "ui.selective_export.item_chapter_labels",
                labelFallback: "Kapitel-Labels",
            },
        ],
    },
    {
        titleKey: "ui.selective_export.group_extra",
        titleFallback: "Zusatzdaten",
        items: [
            {
                key: "storyBible",
                labelKey: "ui.selective_export.item_story_bible",
                labelFallback: "Story Bibles / Storyboards",
            },
            {
                key: "writingSessions",
                labelKey: "ui.selective_export.item_writing_history",
                labelFallback: "Schreibverlauf",
            },
        ],
    },
    {
        titleKey: "ui.selective_export.group_config",
        titleFallback: "Konfiguration",
        items: [
            {
                key: "settings",
                labelKey: "ui.selective_export.item_settings",
                labelFallback: "Einstellungen",
            },
        ],
    },
];

const cardClass =
    "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-4";
const rowClass = "flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-[var(--text)]";

/** Settings card driving the selective data export. */
export function SelectiveExportSection() {
    const { t } = useI18n();
    const feature = useFeature(FEATURES.SELECTIVE_EXPORT);
    const [selection, setSelection] = useState<ExportSelection>(() => ({
        ...EMPTY_SELECTION,
        books: true,
        articles: true,
        authors: true,
    }));
    const [busy, setBusy] = useState(false);
    const [exportProgress, setExportProgress] = useState<BgbProgress | null>(null);

    const allSelected = useMemo(() => Object.values(selection).every(Boolean), [selection]);
    const anySelected = hasAnySelection(selection);

    const toggle = (key: keyof ExportSelection) =>
        setSelection((prev) => ({ ...prev, [key]: !prev[key] }));

    const toggleAll = () =>
        setSelection(allSelected ? { ...EMPTY_SELECTION } : { ...FULL_SELECTION });

    const handleExport = async () => {
        if (!anySelected || busy) return;
        setBusy(true);
        try {
            const now = new Date().toISOString();
            const blob = await exportSelectiveBgb(selection, now, setExportProgress);
            downloadBlob(blob, selectiveBgbFilename(now));
            notify.success(t("ui.selective_export.export_success", "Export erstellt"));
        } catch (err) {
            notify.error(t("ui.selective_export.export_error", "Export fehlgeschlagen"), err);
        } finally {
            setBusy(false);
            setExportProgress(null);
        }
    };

    if (!feature.isActive) return null;

    return (
        <div className={cardClass} data-testid="selective-export-section">
            <h3 className="mb-2 text-base font-semibold text-[var(--text)]">
                {t("ui.selective_export.title", "Selektiver Export")}
            </h3>
            <p className="mb-3 text-sm text-[var(--text-muted)]">
                {t(
                    "ui.selective_export.description",
                    "Wähle aus, welche Datenbereiche exportiert werden sollen. Das Ergebnis ist eine .bgb-Datei (inkl. Bilder der gewählten Inhalte), die über den Import-Assistenten wieder eingelesen werden kann.",
                )}
            </p>

            <label className={`${rowClass} mb-2 font-medium`}>
                <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allSelected}
                    onChange={toggleAll}
                    data-testid="selective-export-select-all"
                />
                {allSelected
                    ? t("ui.selective_export.deselect_all", "Keine auswählen")
                    : t("ui.selective_export.select_all", "Alle auswählen")}
            </label>

            <div className="flex flex-col gap-4">
                {GROUPS.map((group) => (
                    <div key={group.titleKey}>
                        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                            {t(group.titleKey, group.titleFallback)}
                        </h4>
                        <div className="flex flex-col">
                            {group.items.map((item) => (
                                <div key={item.key}>
                                    <label className={rowClass}>
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4"
                                            checked={selection[item.key]}
                                            onChange={() => toggle(item.key)}
                                            data-testid={`selective-export-item-${item.key}`}
                                        />
                                        {t(item.labelKey, item.labelFallback)}
                                    </label>
                                    {item.key === "books" && selection.books && (
                                        <label
                                            className={`${rowClass} pl-6 text-[var(--text-muted)]`}
                                            title={t(
                                                "ui.selective_export.chapters_auto_hint",
                                                "Kapitel werden automatisch mit den Büchern exportiert.",
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4"
                                                checked
                                                disabled
                                                data-testid="selective-export-item-chapters"
                                            />
                                            {t(
                                                "ui.selective_export.item_chapters_auto",
                                                "Kapitel (wird automatisch mit Büchern exportiert)",
                                            )}
                                        </label>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4">
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ gap: 6 }}
                    onClick={handleExport}
                    disabled={!anySelected || busy}
                    data-testid="selective-export-button"
                >
                    <Download size={14} />
                    {t("ui.selective_export.export_button", "Ausgewählte Daten exportieren")}
                </button>
                <BgbExportProgress progress={exportProgress} testId="selective-export-progress" />
                {!anySelected && (
                    <p
                        className="mt-2 text-sm text-[var(--text-muted)]"
                        data-testid="selective-export-empty-hint"
                    >
                        {t(
                            "ui.selective_export.empty_selection",
                            "Bitte mindestens einen Bereich auswählen.",
                        )}
                    </p>
                )}
            </div>
        </div>
    );
}
