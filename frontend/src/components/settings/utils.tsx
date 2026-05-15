import React from "react";

export function isSectionOrder(key: string, value: unknown): boolean {
    // A dict where values are string arrays or null (like section_order with ebook/paperback/etc)
    if (key !== "section_order") return false;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return Object.values(value as Record<string, unknown>).every(
        (v) => v === null || (Array.isArray(v) && v.every((item) => typeof item === "string"))
    );
}

export function getLocalized(value: unknown, fallback: string, lang?: string): string {
    if (!value) return fallback;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
        const obj = value as Record<string, string>;
        return (lang && obj[lang]) || obj.en || obj.de || Object.values(obj)[0] || fallback;
    }
    return fallback;
}

// Normalize legacy boolean merge values to canonical enum strings.
// Migration: true -> "merged", false -> "separate".
export function normalizeMergeMode(value: unknown): "separate" | "merged" | "both" {
    if (value === true) return "merged";
    if (value === false) return "separate";
    if (value === "separate" || value === "merged" || value === "both") return value;
    return "merged";
}

export function renderReadOnlyValue(value: unknown): React.ReactNode {
    if (Array.isArray(value)) {
        return (
            <div style={{display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4}}>
                {value.map((item, i) => (
                    <span key={i} style={{
                        fontSize: "0.75rem", padding: "2px 8px",
                        background: "var(--bg-secondary)", borderRadius: 4,
                        color: "var(--text-secondary)", fontFamily: "var(--font-mono)",
                    }}>
                        {typeof item === "object" ? JSON.stringify(item) : String(item)}
                    </span>
                ))}
            </div>
        );
    }
    if (typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>;
        return (
            <div style={{marginTop: 4, paddingLeft: 12, borderLeft: "2px solid var(--border)"}}>
                {Object.entries(obj).map(([k, v]) => (
                    <div key={k} style={{marginBottom: 4}}>
                        <span style={{fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)"}}>{k}: </span>
                        {typeof v === "object" && v !== null
                            ? renderReadOnlyValue(v)
                            : <span style={{fontSize: "0.8125rem", color: "var(--text-secondary)"}}>{String(v ?? "null")}</span>
                        }
                    </div>
                ))}
            </div>
        );
    }
    return <span style={{fontSize: "0.8125rem", color: "var(--text-secondary)"}}>{String(value)}</span>;
}
