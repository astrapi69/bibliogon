/** Story Bible @-mention TipTap extension (STORY-BIBLE C13).
 *
 * Typing ``@`` in any TipTap surface (chapter editor, picture-book page
 * RichTextEditor) opens an autocomplete of the current book's Story
 * Bible entities, grouped by type. Selecting one inserts a colour-
 * coded inline ``mention`` node carrying the entity id + type. Clicking
 * a rendered mention opens that entity in the Story Bible sidebar
 * (handled by the host editor via ``handleMentionClick``).
 *
 * The extension is created per-book (the suggestion query hits
 * ``listEntities(bookId, undefined, query)``). The suggestion popup is
 * a ReactRenderer mounted into a body-level positioned div — the repo
 * has no tippy/floating-ui, so positioning is done from the
 * suggestion ``clientRect``.
 */
import React, {forwardRef, useImperativeHandle, useState} from "react"
import Mention from "@tiptap/extension-mention"
import {ReactRenderer} from "@tiptap/react"
import type {Editor, Range} from "@tiptap/core"

import {api, type StoryEntityOut} from "../../api/client"
import {getStorage} from "../../storage";
import {entityTypeColor, entityTypeIcon} from "./storyBibleIcons"
import styles from "../storyBibleMention.module.css"

interface MentionItemCommand {
    id: string
    label: string
    entityType: string
}

/** Localized strings for the suggestion popup. The popup mounts via
 *  ReactRenderer into document.body — OUTSIDE the React i18n provider —
 *  so it cannot call useI18n itself. The host editor (which has the
 *  provider) passes pre-translated strings in. */
export interface MentionLabels {
    /** Empty-state text when no entity matches the query. */
    empty: string
    /** entity_type -> localized group-header label. Falls back to the
     *  raw type when a key is missing. */
    types: Record<string, string>
}

const DEFAULT_LABELS: MentionLabels = {
    empty: "No matching entities",
    types: {},
}

const ENTITY_TYPE_IDS = ["character", "setting", "plot_point", "item", "lore"] as const

/** Build the localized popup labels from a host editor's ``t``. Called
 *  inside the editor component (which has the i18n provider) and passed
 *  into createStoryBibleMention. */
export function buildMentionLabels(
    t: (key: string, fallback: string) => string,
): MentionLabels {
    return {
        empty: t("ui.story_bible.mention_no_match", "No matching entities"),
        types: Object.fromEntries(
            ENTITY_TYPE_IDS.map((id) => [id, t(`ui.story_bible.${id}`, id)]),
        ),
    }
}

interface MentionListProps {
    items: StoryEntityOut[]
    command: (item: MentionItemCommand) => void
    labels: MentionLabels
}

export interface MentionListHandle {
    onKeyDown: (event: KeyboardEvent) => boolean
}

/** The autocomplete dropdown. Entities arrive pre-sorted by type from
 *  the backend (entity_type asc, position asc); we render type-group
 *  headers as the type changes. Arrow/Enter keyboard nav is handled
 *  through the imperative handle the suggestion plugin drives. */
const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(
    {items, command, labels},
    ref,
) {
    const [selected, setSelected] = useState(0)

    const select = (index: number) => {
        const item = items[index]
        if (item) command({id: item.id, label: item.name, entityType: item.entity_type})
    }

    useImperativeHandle(ref, () => ({
        onKeyDown: (event: KeyboardEvent) => {
            if (items.length === 0) return false
            if (event.key === "ArrowUp") {
                setSelected((s) => (s + items.length - 1) % items.length)
                return true
            }
            if (event.key === "ArrowDown") {
                setSelected((s) => (s + 1) % items.length)
                return true
            }
            if (event.key === "Enter") {
                select(selected)
                return true
            }
            return false
        },
    }))

    if (items.length === 0) {
        return (
            <div className={styles.popup} data-testid="story-mention-popup">
                <div className={styles.empty} data-testid="story-mention-empty">
                    {labels.empty}
                </div>
            </div>
        )
    }

    let lastType: string | null = null
    return (
        <div className={styles.popup} data-testid="story-mention-popup">
            {items.map((item, index) => {
                const showHeader = item.entity_type !== lastType
                lastType = item.entity_type
                const Icon = entityTypeIcon(item.entity_type)
                const color = entityTypeColor(item.entity_type)
                return (
                    <React.Fragment key={item.id}>
                        {showHeader && (
                            <div className={styles.groupHeader} data-entity-type={item.entity_type}>
                                {labels.types[item.entity_type] ?? item.entity_type}
                            </div>
                        )}
                        <button
                            type="button"
                            className={[styles.item, index === selected ? styles.itemActive : ""]
                                .filter(Boolean)
                                .join(" ")}
                            onMouseEnter={() => setSelected(index)}
                            onMouseDown={(e) => {
                                e.preventDefault()
                                select(index)
                            }}
                            data-testid={`story-mention-item-${item.id}`}
                        >
                            <Icon size={13} aria-hidden style={{color}} />
                            <span>{item.name}</span>
                        </button>
                    </React.Fragment>
                )
            })}
        </div>
    )
})

/** Build a per-book Story Bible Mention extension. ``labels`` carries
 *  the pre-translated popup strings from the host editor. */
export function createStoryBibleMention(bookId: string, labels: MentionLabels = DEFAULT_LABELS) {
    return Mention.extend({
        name: "mention",
        addAttributes() {
            return {
                id: {
                    default: null,
                    parseHTML: (el) => el.getAttribute("data-mention-id"),
                    renderHTML: (attrs) =>
                        attrs.id ? {"data-mention-id": attrs.id as string} : {},
                },
                label: {
                    default: null,
                    parseHTML: (el) => el.getAttribute("data-mention-label"),
                    renderHTML: (attrs) =>
                        attrs.label ? {"data-mention-label": attrs.label as string} : {},
                },
                entityType: {
                    default: null,
                    parseHTML: (el) => el.getAttribute("data-entity-type"),
                    renderHTML: (attrs) =>
                        attrs.entityType
                            ? {"data-entity-type": attrs.entityType as string}
                            : {},
                },
            }
        },
        renderHTML({node, HTMLAttributes}) {
            const entityType = (node.attrs.entityType as string) ?? "character"
            const label = (node.attrs.label as string) ?? (node.attrs.id as string) ?? ""
            return [
                "span",
                {
                    ...HTMLAttributes,
                    class: "story-mention",
                    style: `color: ${entityTypeColor(entityType)}`,
                },
                `@${label}`,
            ]
        },
    }).configure({
        suggestion: {
            char: "@",
            items: async ({query}: {query: string}) => {
                try {
                    return await getStorage().storyBible.listEntities(bookId, undefined, query)
                } catch {
                    return []
                }
            },
            command: ({
                editor,
                range,
                props,
            }: {
                editor: Editor
                range: Range
                // Library types ``props`` as MentionNodeAttrs ({id,label});
                // our MentionList also supplies entityType. Keep the extra
                // field optional so the signature stays assignable.
                props: {
                    id?: string | null
                    label?: string | null
                    entityType?: string | null
                }
            }) => {
                editor
                    .chain()
                    .focus()
                    .insertContentAt(range, [
                        {
                            type: "mention",
                            attrs: {
                                id: props.id,
                                label: props.label,
                                entityType: props.entityType ?? "character",
                            },
                        },
                        {type: "text", text: " "},
                    ])
                    .run()
            },
            render: () => {
                let component: ReactRenderer<MentionListHandle, MentionListProps> | null = null
                let popup: HTMLDivElement | null = null

                const position = (rect: DOMRect | null) => {
                    if (!popup || !rect) return
                    popup.style.left = `${rect.left}px`
                    popup.style.top = `${rect.bottom + 4}px`
                }

                return {
                    onStart: (props: {
                        items: StoryEntityOut[]
                        command: (item: MentionItemCommand) => void
                        clientRect?: (() => DOMRect | null) | null
                    }) => {
                        component = new ReactRenderer(MentionList, {
                            props: {...props, labels},
                            editor: (props as unknown as {editor: Editor}).editor,
                        })
                        popup = document.createElement("div")
                        popup.className = styles.popupAnchor
                        popup.style.position = "absolute"
                        popup.style.zIndex = "1000"
                        popup.appendChild(component.element)
                        document.body.appendChild(popup)
                        position(props.clientRect?.() ?? null)
                    },
                    onUpdate: (props: {
                        items: StoryEntityOut[]
                        clientRect?: (() => DOMRect | null) | null
                    }) => {
                        component?.updateProps({...props, labels})
                        position(props.clientRect?.() ?? null)
                    },
                    onKeyDown: (props: {event: KeyboardEvent}) => {
                        if (props.event.key === "Escape") {
                            popup?.remove()
                            popup = null
                            return true
                        }
                        return component?.ref?.onKeyDown(props.event) ?? false
                    },
                    onExit: () => {
                        popup?.remove()
                        popup = null
                        component?.destroy()
                        component = null
                    },
                }
            },
        },
    })
}

/** Delegated click handler for a rendered mention badge. Host editors
 *  wire this on the EditorContent wrapper's onClick. Returns true when
 *  a mention was clicked + opened. */
export function handleMentionClick(
    event: React.MouseEvent,
    onOpenEntity: (entityId: string) => void,
): boolean {
    const target = event.target as HTMLElement
    const mention = target.closest("[data-mention-id]")
    if (!mention) return false
    const id = mention.getAttribute("data-mention-id")
    if (!id) return false
    event.preventDefault()
    onOpenEntity(id)
    return true
}
