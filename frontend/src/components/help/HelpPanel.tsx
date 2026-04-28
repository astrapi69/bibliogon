import {useCallback, useEffect, useMemo, useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {ChevronRight, ExternalLink, Search, X} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

import {api, HelpNavItem} from "../../api/client";
import {useHelp} from "../../contexts/HelpContext";
import {useI18n} from "../../hooks/useI18n";

/**
 * Full-screen slide-over help panel mounted at the App root.
 *
 * Layout: left sidebar (navigation tree + search) + right content area
 * with Markdown rendering. 600px wide on desktop, full-screen on mobile.
 */
export default function HelpPanel() {
    const {open, slug, closeHelp, openHelp} = useHelp();
    const {t, lang} = useI18n();
    const [nav, setNav] = useState<HelpNavItem[]>([]);
    const [content, setContent] = useState<string>("");
    const [activeSlug, setActiveSlug] = useState<string>("getting-started");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<{slug: string; title: string; snippet: string}[]>([]);
    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(false);

    // Load navigation on open
    useEffect(() => {
        if (!open) return;
        api.help.navigation(lang).then(setNav).catch(() => setNav([]));
    }, [open, lang]);

    // Load page when slug changes
    const loadPage = useCallback(async (pageSlug: string) => {
        setLoading(true);
        setSearchResults([]);
        setSearchQuery("");
        try {
            const page = await api.help.page(lang, pageSlug);
            setContent(page.content);
            setActiveSlug(pageSlug);
        } catch {
            setContent(`# ${t("ui.help.not_found", "Seite nicht gefunden")}\n\n${pageSlug}`);
        }
        setLoading(false);
    }, [lang, t]);

    // Open to specific slug or default
    useEffect(() => {
        if (open) {
            loadPage(slug || "getting-started");
        }
    }, [open, slug, loadPage]);

    // Search with debounce
    useEffect(() => {
        if (!searchQuery || searchQuery.length < 2) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await api.help.search(lang, searchQuery);
                setSearchResults(res.results);
            } catch {
                setSearchResults([]);
            }
            setSearching(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, lang]);

    // Breadcrumb from active slug
    const breadcrumb = useMemo(() => {
        const parts = activeSlug.split("/");
        const crumbs: {label: string; slug: string}[] = [];
        for (const item of nav) {
            if (item.slug === activeSlug) {
                crumbs.push({label: item.title, slug: item.slug});
                break;
            }
            if (item.children) {
                for (const child of item.children) {
                    if (child.slug === activeSlug) {
                        crumbs.push({label: item.title, slug: item.slug});
                        crumbs.push({label: child.title, slug: child.slug});
                        break;
                    }
                }
            }
        }
        if (crumbs.length === 0) {
            crumbs.push({label: parts[parts.length - 1], slug: activeSlug});
        }
        return crumbs;
    }, [activeSlug, nav]);

    return (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) closeHelp(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content
                    className="help-panel"
                    aria-describedby={undefined}
                    style={{
                        position: "fixed",
                        top: 0,
                        right: 0,
                        bottom: 0,
                        width: "min(680px, 100vw)",
                        background: "var(--bg-primary)",
                        borderLeft: "1px solid var(--border)",
                        boxShadow: "var(--shadow-lg, -4px 0 24px rgba(0,0,0,0.15))",
                        display: "flex",
                        flexDirection: "column",
                        zIndex: 9999,
                        overflow: "hidden",
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 16px", borderBottom: "1px solid var(--border)",
                        flexShrink: 0,
                    }}>
                        <Dialog.Title style={{fontSize: "1rem", fontWeight: 600, fontFamily: "var(--font-display)"}}>
                            {t("ui.help.title", "Hilfe")}
                        </Dialog.Title>
                        <div style={{display: "flex", gap: 8, alignItems: "center"}}>
                            <a
                                href="https://astrapi69.github.io/bibliogon/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-icon"
                                title={t("ui.help.open_online", "Online öffnen")}
                            >
                                <ExternalLink size={16}/>
                            </a>
                            <Dialog.Close className="btn-icon">
                                <X size={18}/>
                            </Dialog.Close>
                        </div>
                    </div>

                    {/* Body: sidebar + content */}
                    <div style={{display: "flex", flex: 1, overflow: "hidden"}}>
                        {/* Sidebar */}
                        <div style={{
                            width: 220, flexShrink: 0,
                            borderRight: "1px solid var(--border)",
                            display: "flex", flexDirection: "column",
                            overflow: "hidden",
                        }}>
                            {/* Search */}
                            <div style={{padding: "8px 10px", borderBottom: "1px solid var(--border)"}}>
                                <div style={{position: "relative"}}>
                                    <Search size={14} style={{
                                        position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                                        color: "var(--text-muted)",
                                    }}/>
                                    <input
                                        className="input"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder={t("ui.help.search_placeholder", "Suchen...")}
                                        style={{paddingLeft: 28, fontSize: "0.8125rem", height: 32}}
                                    />
                                </div>
                            </div>

                            {/* Search results or Navigation */}
                            <div style={{flex: 1, overflowY: "auto", padding: "6px 0"}}>
                                {searchResults.length > 0 ? (
                                    <div>
                                        <div style={{
                                            padding: "4px 12px", fontSize: "0.6875rem",
                                            color: "var(--text-muted)", textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                        }}>
                                            {searchResults.length} {t("ui.help.results", "Ergebnisse")}
                                        </div>
                                        {searchResults.map((r) => (
                                            <button
                                                key={r.slug}
                                                onClick={() => loadPage(r.slug)}
                                                style={{
                                                    display: "block", width: "100%", textAlign: "left",
                                                    padding: "6px 12px", border: "none", background: "none",
                                                    cursor: "pointer", fontSize: "0.8125rem",
                                                    color: "var(--text-primary)",
                                                    fontFamily: "var(--font-body)",
                                                }}
                                            >
                                                <div style={{fontWeight: 500}}>{r.title}</div>
                                                <div style={{
                                                    fontSize: "0.6875rem", color: "var(--text-muted)",
                                                    overflow: "hidden", textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}>
                                                    {r.snippet.slice(0, 80)}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <NavTree
                                        items={nav}
                                        activeSlug={activeSlug}
                                        onSelect={loadPage}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{flex: 1, overflowY: "auto", padding: "16px 24px"}}>
                            {/* Breadcrumb */}
                            <div style={{
                                display: "flex", alignItems: "center", gap: 4,
                                fontSize: "0.75rem", color: "var(--text-muted)",
                                marginBottom: 12,
                            }}>
                                {breadcrumb.map((crumb, i) => (
                                    <span key={crumb.slug} style={{display: "flex", alignItems: "center", gap: 4}}>
                                        {i > 0 && <ChevronRight size={10}/>}
                                        <button
                                            onClick={() => loadPage(crumb.slug)}
                                            style={{
                                                background: "none", border: "none", cursor: "pointer",
                                                color: i === breadcrumb.length - 1 ? "var(--text-primary)" : "var(--text-muted)",
                                                fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                                                fontSize: "0.75rem", padding: 0,
                                                fontFamily: "var(--font-body)",
                                            }}
                                        >
                                            {crumb.label}
                                        </button>
                                    </span>
                                ))}
                            </div>

                            {loading ? (
                                <div style={{color: "var(--text-muted)", fontSize: "0.875rem"}}>
                                    {t("ui.common.loading", "Laden...")}
                                </div>
                            ) : (
                                <div className="help-content">
                                    <Markdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeSlug, rehypeAutolinkHeadings]}
                                        components={{
                                            // Internal links: navigate within the help panel
                                            a: ({href, children, ...props}) => {
                                                if (href && !href.startsWith("http") && !href.startsWith("#")) {
                                                    return (
                                                        <a
                                                            {...props}
                                                            href={href}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                const slug = href.replace(/\.md$/, "").replace(/^\//, "");
                                                                loadPage(slug);
                                                            }}
                                                            style={{color: "var(--accent)", cursor: "pointer"}}
                                                        >
                                                            {children}
                                                        </a>
                                                    );
                                                }
                                                // External links open in new tab
                                                return (
                                                    <a
                                                        {...props}
                                                        href={href}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{color: "var(--accent)"}}
                                                    >
                                                        {children} <ExternalLink size={10} style={{verticalAlign: "middle"}}/>
                                                    </a>
                                                );
                                            },
                                        }}
                                    >
                                        {content}
                                    </Markdown>
                                </div>
                            )}
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/** Recursive nav tree renderer. */
function NavTree({
    items, activeSlug, onSelect, depth = 0,
}: {
    items: HelpNavItem[];
    activeSlug: string;
    onSelect: (slug: string) => void;
    depth?: number;
}) {
    return (
        <>
            {items.map((item) => {
                const isActive = item.slug === activeSlug;
                const hasChildren = item.children && item.children.length > 0;
                const isParentActive = hasChildren && item.children!.some((c) => c.slug === activeSlug);
                const [expanded, setExpanded] = useState(isParentActive || depth === 0);

                return (
                    <div key={item.slug}>
                        <button
                            onClick={() => {
                                if (hasChildren) {
                                    setExpanded(!expanded);
                                } else {
                                    onSelect(item.slug);
                                }
                            }}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                width: "100%", textAlign: "left",
                                padding: `4px ${12 + depth * 12}px`,
                                border: "none", cursor: "pointer",
                                background: isActive ? "var(--accent-light, rgba(59,130,246,0.08))" : "none",
                                color: isActive ? "var(--accent)" : "var(--text-primary)",
                                fontWeight: isActive ? 600 : 400,
                                fontSize: "0.8125rem",
                                fontFamily: "var(--font-body)",
                                borderRadius: 0,
                            }}
                        >
                            {hasChildren && (
                                <ChevronRight
                                    size={12}
                                    style={{
                                        transform: expanded ? "rotate(90deg)" : "none",
                                        transition: "transform 0.15s",
                                        flexShrink: 0,
                                    }}
                                />
                            )}
                            <span>{item.title}</span>
                        </button>
                        {hasChildren && expanded && (
                            <NavTree
                                items={item.children!}
                                activeSlug={activeSlug}
                                onSelect={onSelect}
                                depth={depth + 1}
                            />
                        )}
                    </div>
                );
            })}
        </>
    );
}
