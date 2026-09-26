import { useState } from "react";

import {
    APLUS_BULLET_COUNT,
    APLUS_FIELD_LIMITS,
    createModule,
    moduleHasContent,
    moveModule,
    newModuleId,
    type AplusBulletDraft,
    type AplusDocumentDraft,
    type AplusModuleDraft,
} from "../../../lib/utils/aplus/aplusDocument";
import { useDialog } from "../../shared/AppDialog";
import type { TFunc } from "../tabTypes";
import AplusField from "./AplusField";
import AplusModuleCard from "./AplusModuleCard";
import AplusModuleGallery from "./AplusModuleGallery";

interface AplusDocumentEditorProps {
    document: AplusDocumentDraft;
    onChange: (document: AplusDocumentDraft) => void;
    t: TFunc;
}

function paddedBullets(bullets: AplusBulletDraft[]): AplusBulletDraft[] {
    const missing = Math.max(0, APLUS_BULLET_COUNT - bullets.length);
    return [...bullets, ...Array.from({ length: missing }, () => ({ heading: "", body: "" }))];
}

function BulletFields({ document, onChange, t }: AplusDocumentEditorProps) {
    const bullets = paddedBullets(document.bullets);
    const setBullet = (index: number, key: keyof AplusBulletDraft) => (value: string) =>
        onChange({ ...document, bullets: bullets.map((b, i) => (i === index ? { ...b, [key]: value } : b)) });
    return (
        <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold">{t("ui.aplus.bullets", "Bulletpoints")}</span>
            {bullets.map((bullet, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                    <AplusField
                        label={t("ui.aplus.bullet_heading", "Überschrift {n}").replace("{n}", String(i + 1))}
                        value={bullet.heading}
                        onChange={setBullet(i, "heading")}
                        testId={`aplus-bullet-${i}-heading`}
                        maxChars={APLUS_FIELD_LIMITS.bullet_heading}
                    />
                    <AplusField
                        label={t("ui.aplus.bullet_body", "Text")}
                        value={bullet.body}
                        onChange={setBullet(i, "body")}
                        testId={`aplus-bullet-${i}-body`}
                        maxChars={APLUS_FIELD_LIMITS.bullet_body}
                        rows={3}
                    />
                </div>
            ))}
        </div>
    );
}

function trimSummary(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    const safe = Math.max(0, maxLength - 3);
    return `${text.slice(0, safe).trimEnd()}...`;
}

function filledBullets(bullets: AplusBulletDraft[]): number {
    return bullets.filter((bullet) => bullet.heading.trim() || bullet.body.trim()).length;
}

function AplusBasicsCard({ document, onChange, t }: AplusDocumentEditorProps) {
    const [expanded, setExpanded] = useState(false);
    const toggleLabel = expanded ? t("ui.common.close", "Schliessen") : t("ui.common.edit", "Bearbeiten");
    const contentName = (document.content_name ?? "").trim();
    const shortDescription = (document.short_description ?? "").trim();
    const bulletCount = filledBullets(document.bullets);
    const bulletSummary = `${t("ui.aplus.bullets", "Bulletpoints")}: ${bulletCount}/${APLUS_BULLET_COUNT}`;
    const summary = shortDescription ? trimSummary(shortDescription, 140) : bulletSummary;

    if (!expanded) {
        return (
            <section
                className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-card)] p-3"
                data-testid="aplus-basics"
                data-state="collapsed"
            >
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <strong className="text-sm">{t("ui.aplus.basics_title", "A+ Basis")}</strong>
                        {contentName && <span className="text-xs text-[var(--text-muted)]">{contentName}</span>}
                        <span className="text-xs text-[var(--text-muted)]">{summary}</span>
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm min-h-[44px]"
                        data-testid="aplus-basics-toggle"
                        onClick={() => setExpanded(true)}
                        aria-expanded={expanded}
                    >
                        {toggleLabel}
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section
            className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3"
            data-testid="aplus-basics"
            data-state="open"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{t("ui.aplus.basics_title", "A+ Basis")}</strong>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm min-h-[44px]"
                    data-testid="aplus-basics-toggle"
                    onClick={() => setExpanded(false)}
                    aria-expanded={expanded}
                >
                    {toggleLabel}
                </button>
            </div>
            <AplusField
                label={t("ui.aplus.content_name", "Name des Inhalts")}
                value={document.content_name}
                onChange={(value) => onChange({ ...document, content_name: value })}
                testId="aplus-content-name"
            />
            <AplusField
                label={t("ui.aplus.short_description", "Kurzbeschreibung")}
                value={document.short_description}
                onChange={(value) => onChange({ ...document, short_description: value })}
                testId="aplus-short-description"
                maxChars={APLUS_FIELD_LIMITS.short_description}
                rows={3}
            />
            <BulletFields document={document} onChange={onChange} t={t} />
        </section>
    );
}

/**
 * Editor for the whole A+ document (#891): content name, short description,
 * bullets, the module list, and the gallery of Amazon's modules to add from.
 * Controlled: every edit reports a new document through `onChange`.
 *
 * @example
 * <AplusDocumentEditor document={doc} onChange={aplus.update} t={t} />
 */
export default function AplusDocumentEditor({ document, onChange, t }: AplusDocumentEditorProps) {
    const dialog = useDialog();
    const setModules = (modules: AplusModuleDraft[]) => onChange({ ...document, modules });

    const removeModule = async (index: number) => {
        const module = document.modules[index];
        if (moduleHasContent(module)) {
            const ok = await dialog.confirm(
                t("ui.aplus.module_remove_title", "Modul entfernen?"),
                t("ui.aplus.module_remove_message", "Alle Texte und Prompts dieses Moduls gehen verloren."),
                "danger",
            );
            if (!ok) return;
        }
        setModules(document.modules.filter((_, i) => i !== index));
    };

    return (
        <div className="flex flex-col gap-4" data-testid="aplus-editor">
            <AplusBasicsCard document={document} onChange={onChange} t={t} />
            {document.modules.map((module, i) => (
                <AplusModuleCard
                    key={module.id}
                    module={module}
                    index={i}
                    count={document.modules.length}
                    t={t}
                    onChange={(next) => setModules(document.modules.map((m, j) => (j === i ? next : m)))}
                    onMove={(delta) => setModules(moveModule(document.modules, i, delta))}
                    onRemove={() => void removeModule(i)}
                />
            ))}
            <AplusModuleGallery
                modules={document.modules}
                onAdd={(templateId) => setModules([...document.modules, createModule(templateId, newModuleId())])}
                t={t}
            />
        </div>
    );
}
