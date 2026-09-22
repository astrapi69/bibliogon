import { useState } from "react";
import { LayoutGrid, List as ListIcon, Plus } from "lucide-react";
import { EntityViewSwitcher } from "@astrapi69/entity-kit";

import type { AplusModuleDraft } from "../../../lib/utils/aplus/aplusDocument";
import {
    APLUS_MODULE_TEMPLATES,
    KDP_MAX_MODULES,
    imageSizesSummary,
    type AplusModuleCategory,
    type AplusModuleTemplate,
} from "../../../lib/utils/aplus/moduleTemplates";
import type { TFunc } from "../tabTypes";
import AplusModuleSketch from "./AplusModuleSketch";

const CATEGORIES: readonly { id: AplusModuleCategory; labelFallback: string }[] = [
    { id: "image", labelFallback: "Bild und Text" },
    { id: "text", labelFallback: "Nur Text" },
    { id: "table", labelFallback: "Tabellen" },
    { id: "brand", labelFallback: "Marke" },
];

type GalleryView = "tile" | "list";

interface AplusModuleGalleryProps {
    modules: AplusModuleDraft[];
    onAdd: (templateId: string) => void;
    t: TFunc;
}

/** Localised module name, falling back to Amazon's English name. */
export function templateName(template: AplusModuleTemplate, t: TFunc): string {
    return t(`ui.aplus.template_${template.id}`, template.name);
}

function ModuleButton({
    template,
    view,
    taken,
    t,
    onAdd,
}: {
    template: AplusModuleTemplate;
    view: GalleryView;
    taken: boolean;
    t: TFunc;
    onAdd: () => void;
}) {
    const sizes = imageSizesSummary(template) || t("ui.aplus.no_image", "Kein Bild");
    const purpose = t(`ui.aplus.template_${template.id}_purpose`, template.purpose);
    const tile = view === "tile";
    return (
        <button
            type="button"
            className={`flex min-h-[44px] gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] p-2 text-left hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${tile ? "flex-col" : "flex-row items-center"}`}
            data-testid={`aplus-add-${template.id}`}
            disabled={taken}
            onClick={onAdd}
        >
            {tile && <AplusModuleSketch template={template} />}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">{templateName(template, t)}</span>
                <span className="text-xs text-[var(--text-muted)]">{sizes}</span>
                <span className="text-xs text-[var(--text-muted)]">
                    {taken ? t("ui.aplus.module_taken", "Schon vorhanden, nur einmal erlaubt") : purpose}
                </span>
            </span>
            {!tile && <Plus size={16} aria-hidden="true" />}
        </button>
    );
}

/**
 * Gallery of Amazon's A+ modules (#895) for building the A+ document: tiles
 * with a layout sketch or a compact list, grouped by kind. A click adds the
 * module. A once-only module is disabled when present; from KDP's
 * five-module limit on a note says so, adding stays possible for drafts.
 *
 * @example
 * <AplusModuleGallery modules={doc.modules} onAdd={addModule} t={t} />
 */
export default function AplusModuleGallery({ modules, onAdd, t }: AplusModuleGalleryProps) {
    const [view, setView] = useState<GalleryView>("tile");
    const used = new Set(modules.map((module) => module.template));
    return (
        <section className="flex flex-col gap-3" data-testid="aplus-module-gallery" data-view={view}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{t("ui.aplus.add_module", "Modul hinzufügen")}</strong>
                <EntityViewSwitcher
                    mode={view}
                    onChange={(mode) => setView(mode === "list" ? "list" : "tile")}
                    options={[
                        { mode: "tile", label: t("ui.aplus.view_tiles", "Kacheln"), icon: <LayoutGrid size={16} /> },
                        { mode: "list", label: t("ui.aplus.view_list", "Liste"), icon: <ListIcon size={16} /> },
                    ]}
                    classNames={{
                        group: "inline-flex overflow-hidden rounded-[var(--radius-sm)] border border-border bg-card",
                        button: "inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-[10px] text-muted-foreground",
                        activeButton: "bg-primary text-white",
                        label: "sr-only",
                    }}
                />
            </div>
            {modules.length >= KDP_MAX_MODULES && (
                <p className="m-0 text-sm text-[var(--text-muted)]" data-testid="aplus-gallery-limit" role="status">
                    {t(
                        "ui.aplus.module_limit",
                        "KDP zeigt höchstens {max} Module pro A+ Content. Weitere kannst du als Entwurf behalten.",
                    ).replace("{max}", String(KDP_MAX_MODULES))}
                </p>
            )}
            {CATEGORIES.map((category) => {
                const templates = APLUS_MODULE_TEMPLATES.filter((template) => template.category === category.id);
                return (
                    <div key={category.id} className="flex flex-col gap-2" data-testid={`aplus-gallery-group-${category.id}`}>
                        <span className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                            {t(`ui.aplus.category_${category.id}`, category.labelFallback)}
                        </span>
                        <div className={view === "tile" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" : "flex flex-col gap-2"}>
                            {templates.map((template) => (
                                <ModuleButton
                                    key={template.id}
                                    template={template}
                                    view={view}
                                    taken={Boolean(template.once && used.has(template.id))}
                                    t={t}
                                    onAdd={() => onAdd(template.id)}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}
