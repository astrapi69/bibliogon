/**
 * Resolves Lucide-icon-name strings from the BookTypeRegistry YAML
 * to React components. Filed by BOOK-TYPES-SSOT-YAML-01 C5
 * (2026-05-24).
 *
 * The YAML stores icon names as PascalCase strings (e.g.
 * "BookOpen", "Image", "Layers") rather than JSX so the SSoT file
 * stays serializable + cross-consumable by backend code that
 * doesn't care about icons. Frontend consumers map the string to
 * the actual Lucide component at render time.
 *
 * Negative-default: unknown icon names render the BookOpen fallback
 * so a new YAML entry with an unmapped icon still renders something
 * sensible (and the LL "Half-wired feature lifecycle" rule's
 * detection mechanism — visible-but-wrong-icon — surfaces the gap
 * in user-visible UI rather than throwing).
 */

import {BookOpen, Image, Layers, type LucideIcon} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
    BookOpen,
    Image,
    Layers,
};

interface Props {
    iconName: string;
    size?: number;
}

/** Render the named Lucide icon at the given size, falling back to
 *  BookOpen for unmapped names. */
export function BookTypeIcon({iconName, size = 24}: Props) {
    const Icon = ICON_MAP[iconName] ?? BookOpen;
    return <Icon size={size} />;
}
