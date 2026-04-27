/**
 * AR-02 Phase 2 PublicationsPanel.
 *
 * Renders the per-article publications list + add modal in the
 * ArticleEditor sidebar. Drift detection is server-driven; this
 * component just reflects the status the backend returns.
 */

import { useEffect, useState } from "react";
import {
    AlertTriangle,
    CheckCircle,
    Clock,
    ExternalLink,
    Plus,
    Trash2,
} from "lucide-react";

import {
    api,
    ApiError,
    PlatformSchema,
    Publication,
    PublicationStatus,
} from "../../api/client";
import { useDialog } from "../AppDialog";
import { useI18n } from "../../hooks/useI18n";
import { notify } from "../../utils/notify";

const STATUS_PILL_COLORS: Record<PublicationStatus, { bg: string; fg: string }> = {
    planned: { bg: "var(--bg-card)", fg: "var(--text-muted)" },
    scheduled: { bg: "var(--bg-card)", fg: "var(--accent)" },
    published: { bg: "var(--success-light, #dcfce7)", fg: "var(--success, #166534)" },
    out_of_sync: {
        bg: "var(--accent-light, #fff8e6)",
        fg: "var(--warning, #b45309)",
    },
    archived: { bg: "var(--bg-card)", fg: "var(--text-muted)" },
};

export function PublicationsPanel({
    articleId,
}: {
    articleId: string;
}) {
    const { t } = useI18n();
    const [publications, setPublications] = useState<Publication[]>([]);
    const [schemas, setSchemas] = useState<Record<string, PlatformSchema>>({});
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);

    async function refresh(): Promise<void> {
        setLoading(true);
        try {
            const [pubs, sch] = await Promise.all([
                api.publications.list(articleId),
                api.articlePlatforms.list(),
            ]);
            setPublications(pubs);
            setSchemas(sch);
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.publications.load_error",
                        "Konnte Publikationen nicht laden.",
                    ),
                    err,
                );
            }
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [articleId]);

    return (
        <section data-testid="publications-panel" style={panelStyles.section}>
            <header style={panelStyles.header}>
                <h3 style={panelStyles.heading}>
                    {t("ui.publications.title", "Publikationen")}
                </h3>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    data-testid="publications-add-btn"
                    onClick={() => setShowAdd(true)}
                >
                    <Plus size={12} />
                    {t("ui.publications.add", "Hinzufuegen")}
                </button>
            </header>
            {loading && publications.length === 0 ? (
                <p style={panelStyles.muted}>
                    {t("ui.common.loading", "Laedt...")}
                </p>
            ) : publications.length === 0 ? (
                <p
                    data-testid="publications-empty"
                    style={panelStyles.muted}
                >
                    {t(
                        "ui.publications.empty",
                        "Noch nicht veroeffentlicht.",
                    )}
                </p>
            ) : (
                <ul style={panelStyles.list}>
                    {publications.map((p) => (
                        <PublicationRow
                            key={p.id}
                            articleId={articleId}
                            publication={p}
                            schema={schemas[p.platform]}
                            onChanged={() => void refresh()}
                        />
                    ))}
                </ul>
            )}
            {showAdd && (
                <AddPublicationModal
                    articleId={articleId}
                    schemas={schemas}
                    onClose={() => setShowAdd(false)}
                    onCreated={() => {
                        setShowAdd(false);
                        void refresh();
                    }}
                />
            )}
        </section>
    );
}

function PublicationRow({
    articleId,
    publication,
    schema,
    onChanged,
}: {
    articleId: string;
    publication: Publication;
    schema: PlatformSchema | undefined;
    onChanged: () => void;
}) {
    const { t } = useI18n();
    const { confirm } = useDialog();

    const colors = STATUS_PILL_COLORS[publication.status] ?? STATUS_PILL_COLORS.planned;
    const platformLabel = schema?.display_name ?? publication.platform;
    const publishedUrl = (publication.platform_metadata?.published_url as string | undefined) ?? null;

    async function handleMarkPublished(): Promise<void> {
        try {
            await api.publications.markPublished(
                articleId,
                publication.id,
                {},
            );
            notify.success(
                t(
                    "ui.publications.mark_published_success",
                    "Als veroeffentlicht markiert.",
                ),
            );
            onChanged();
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.publications.mark_published_error",
                        "Konnte nicht markiert werden.",
                    ),
                    err,
                );
            }
        }
    }

    async function handleVerifyLive(): Promise<void> {
        try {
            await api.publications.verifyLive(articleId, publication.id);
            notify.success(
                t(
                    "ui.publications.verify_live_success",
                    "Live-Version bestaetigt.",
                ),
            );
            onChanged();
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.publications.verify_live_error",
                        "Konnte Live-Version nicht bestaetigen.",
                    ),
                    err,
                );
            }
        }
    }

    async function handleDelete(): Promise<void> {
        const ok = await confirm(
            t("ui.publications.delete_title", "Publikation loeschen?"),
            t(
                "ui.publications.delete_body",
                "Diese Publikation wird entfernt. Der Artikel selbst bleibt unveraendert.",
            ),
            "danger",
            { confirmLabel: t("ui.publications.delete_confirm", "Loeschen") },
        );
        if (!ok) return;
        try {
            await api.publications.delete(articleId, publication.id);
            onChanged();
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.publications.delete_error",
                        "Loeschen fehlgeschlagen.",
                    ),
                    err,
                );
            }
        }
    }

    return (
        <li
            data-testid={`publication-row-${publication.id}`}
            data-status={publication.status}
            style={panelStyles.row}
        >
            <div style={panelStyles.rowHeader}>
                <strong style={panelStyles.platform}>
                    {platformLabel}
                </strong>
                {publication.is_promo && (
                    <span style={panelStyles.promoBadge}>
                        {t("ui.publications.promo_badge", "Promo")}
                    </span>
                )}
                <span
                    data-testid={`publication-row-status-${publication.id}`}
                    style={{
                        ...panelStyles.statusPill,
                        background: colors.bg,
                        color: colors.fg,
                    }}
                >
                    {publication.status === "out_of_sync" && (
                        <AlertTriangle size={10} aria-hidden />
                    )}
                    {publication.status === "published" && (
                        <CheckCircle size={10} aria-hidden />
                    )}
                    {publication.status === "scheduled" && (
                        <Clock size={10} aria-hidden />
                    )}
                    {t(
                        `ui.publications.status_${publication.status}`,
                        publication.status,
                    )}
                </span>
            </div>
            {publication.status === "out_of_sync" && (
                <p
                    data-testid={`publication-drift-warning-${publication.id}`}
                    style={panelStyles.driftWarning}
                >
                    {t(
                        "ui.publications.drift_warning",
                        "Live-Version koennte nicht mit dem aktuellen Entwurf uebereinstimmen.",
                    )}
                </p>
            )}
            {publishedUrl && (
                <a
                    href={publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={panelStyles.publishedLink}
                    data-testid={`publication-row-url-${publication.id}`}
                >
                    <ExternalLink size={11} />
                    {publishedUrl}
                </a>
            )}
            <div style={panelStyles.rowActions}>
                {publication.status !== "published" &&
                    publication.status !== "out_of_sync" && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => void handleMarkPublished()}
                            data-testid={`publication-mark-published-${publication.id}`}
                        >
                            {t(
                                "ui.publications.mark_published",
                                "Als veroeffentlicht",
                            )}
                        </button>
                    )}
                {(publication.status === "published" ||
                    publication.status === "out_of_sync") && (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleVerifyLive()}
                        data-testid={`publication-verify-live-${publication.id}`}
                    >
                        {t(
                            "ui.publications.verify_live",
                            "Live bestaetigen",
                        )}
                    </button>
                )}
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void handleDelete()}
                    data-testid={`publication-delete-${publication.id}`}
                    style={{ color: "var(--error, #b91c1c)" }}
                >
                    <Trash2 size={12} />
                </button>
            </div>
        </li>
    );
}

function AddPublicationModal({
    articleId,
    schemas,
    onClose,
    onCreated,
}: {
    articleId: string;
    schemas: Record<string, PlatformSchema>;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { t } = useI18n();
    const platformOptions = Object.keys(schemas);
    const [platform, setPlatform] = useState<string>(platformOptions[0] ?? "custom");
    const [isPromo, setIsPromo] = useState(false);
    const [metadata, setMetadata] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    const schema = schemas[platform];
    const fields = [
        ...(schema?.required_metadata ?? []),
        ...(schema?.optional_metadata ?? []),
    ];

    async function submit(): Promise<void> {
        setSubmitting(true);
        setErrors([]);
        try {
            // Send only non-empty fields. Backend validates required.
            const meta: Record<string, unknown> = {};
            for (const k of Object.keys(metadata)) {
                const v = metadata[k];
                if (!v) continue;
                if (k === "tags" || k === "hashtags") {
                    meta[k] = v
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                } else {
                    meta[k] = v;
                }
            }
            await api.publications.create(articleId, {
                platform,
                is_promo: isPromo,
                platform_metadata: meta,
            });
            notify.success(
                t("ui.publications.added", "Publikation hinzugefuegt."),
            );
            onCreated();
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 400) {
                    const detail = err.detailBody as
                        | { errors?: string[] }
                        | undefined;
                    setErrors(detail?.errors ?? [t("ui.publications.add_failed", "Validierung fehlgeschlagen.")]);
                } else {
                    notify.error(
                        t("ui.publications.add_failed", "Konnte nicht hinzufuegen."),
                        err,
                    );
                }
            }
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div
            role="dialog"
            data-testid="publications-add-modal"
            style={modalStyles.overlay}
            onClick={onClose}
        >
            <div style={modalStyles.content} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ margin: 0, marginBottom: 12 }}>
                    {t("ui.publications.add_title", "Publikation hinzufuegen")}
                </h3>
                <label style={modalStyles.fieldLabel}>
                    {t("ui.publications.platform", "Plattform")}
                </label>
                <select
                    data-testid="publications-add-platform"
                    value={platform}
                    onChange={(e) => {
                        setPlatform(e.target.value);
                        setMetadata({});
                    }}
                    style={modalStyles.fieldInput}
                >
                    {platformOptions.map((slug) => (
                        <option key={slug} value={slug}>
                            {schemas[slug]?.display_name ?? slug}
                        </option>
                    ))}
                </select>
                <label style={modalStyles.checkbox}>
                    <input
                        data-testid="publications-add-is-promo"
                        type="checkbox"
                        checked={isPromo}
                        onChange={(e) => setIsPromo(e.target.checked)}
                    />
                    {t(
                        "ui.publications.is_promo",
                        "Promo-Post (verlinkt auf eine Hauptpublikation)",
                    )}
                </label>
                {fields.map((field) => {
                    const required = schema?.required_metadata.includes(field) ?? false;
                    return (
                        <div key={field} style={{ marginTop: 8 }}>
                            <label style={modalStyles.fieldLabel}>
                                {field}
                                {required && (
                                    <span style={{ color: "var(--error)" }}> *</span>
                                )}
                            </label>
                            <input
                                data-testid={`publications-add-field-${field}`}
                                type="text"
                                value={metadata[field] ?? ""}
                                onChange={(e) =>
                                    setMetadata({
                                        ...metadata,
                                        [field]: e.target.value,
                                    })
                                }
                                style={modalStyles.fieldInput}
                            />
                        </div>
                    );
                })}
                {schema?.notes && (
                    <p style={modalStyles.note}>
                        <em>{schema.notes}</em>
                    </p>
                )}
                {errors.length > 0 && (
                    <ul
                        data-testid="publications-add-errors"
                        style={modalStyles.errorList}
                    >
                        {errors.map((e) => (
                            <li key={e}>{e}</li>
                        ))}
                    </ul>
                )}
                <div style={modalStyles.footer}>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={onClose}
                        data-testid="publications-add-cancel"
                    >
                        {t("ui.common.cancel", "Abbrechen")}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={submitting}
                        onClick={() => void submit()}
                        data-testid="publications-add-submit"
                    >
                        {t("ui.publications.add_submit", "Hinzufuegen")}
                    </button>
                </div>
            </div>
        </div>
    );
}

const panelStyles: Record<string, React.CSSProperties> = {
    section: {
        marginTop: 16,
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    heading: {
        margin: 0,
        fontSize: "0.875rem",
        fontWeight: 600,
        color: "var(--text-secondary)",
    },
    muted: {
        margin: 0,
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
    },
    list: {
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },
    row: {
        padding: "8px 10px",
        background: "var(--bg-primary)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        fontSize: "0.8125rem",
    },
    rowHeader: {
        display: "flex",
        alignItems: "center",
        gap: 6,
    },
    platform: {
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    promoBadge: {
        fontSize: "0.625rem",
        padding: "1px 6px",
        background: "var(--accent-light, #fff8e6)",
        color: "var(--accent)",
        borderRadius: 4,
        fontWeight: 500,
    },
    statusPill: {
        fontSize: "0.625rem",
        padding: "1px 6px",
        borderRadius: 4,
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
    },
    driftWarning: {
        margin: "6px 0 0 0",
        fontSize: "0.75rem",
        color: "var(--warning, #b45309)",
        fontStyle: "italic",
    },
    publishedLink: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        marginTop: 6,
        fontSize: "0.75rem",
        color: "var(--accent)",
        textDecoration: "none",
        wordBreak: "break-all",
    },
    rowActions: {
        marginTop: 8,
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
    },
};

const modalStyles: Record<string, React.CSSProperties> = {
    overlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    content: {
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: 16,
        width: "min(420px, 95vw)",
        maxHeight: "85vh",
        overflowY: "auto",
        color: "var(--text-primary)",
    },
    fieldLabel: {
        display: "block",
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        marginTop: 6,
    },
    fieldInput: {
        width: "100%",
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: 4,
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontSize: "0.875rem",
    },
    checkbox: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
        fontSize: "0.8125rem",
    },
    note: {
        marginTop: 8,
        fontSize: "0.75rem",
        color: "var(--text-muted)",
    },
    errorList: {
        marginTop: 8,
        padding: "8px 12px 8px 24px",
        background: "var(--accent-light, #fff8e6)",
        border: "1px solid var(--warning, #b45309)",
        borderRadius: 4,
        fontSize: "0.75rem",
        color: "var(--warning, #b45309)",
    },
    footer: {
        marginTop: 12,
        display: "flex",
        gap: 6,
        justifyContent: "flex-end",
    },
};
