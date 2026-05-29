/**
 * Resolves Lucide-icon-name strings from the ArticleTypeRegistry
 * YAML to React components. Filed by ARTICLE-TYPES-SSOT-01 C5
 * (2026-05-29). Mirrors bookTypeIcon.tsx.
 *
 * The YAML stores icon names as PascalCase strings (e.g.
 * "FileText", "GraduationCap", "Star") rather than JSX so the
 * SSoT file stays serializable + cross-consumable by backend code
 * that doesn't care about icons. Frontend consumers map the
 * string to the actual Lucide component at render time.
 *
 * Negative-default: unknown icon names render the FileText
 * fallback so a new YAML entry with an unmapped icon still
 * renders something sensible.
 */

import {
    BookOpen,
    FileText,
    Feather,
    GraduationCap,
    ListOrdered,
    Mail,
    Star,
    Users,
    type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
    BookOpen,
    FileText,
    Feather,
    GraduationCap,
    ListOrdered,
    Mail,
    Star,
    Users,
};

interface Props {
    iconName: string;
    size?: number;
}

/** Render the named Lucide icon at the given size, falling back
 *  to FileText for unmapped names. */
export function ArticleTypeIcon({iconName, size = 24}: Props) {
    const Icon = ICON_MAP[iconName] ?? FileText;
    return <Icon size={size} />;
}
