/** Arc View (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C9).
 *
 * A swim-lane timeline of character/entity arcs across a book's pages.
 * Pages run left-to-right (by position); each entity with appearances
 * gets a horizontal lane with a dot on every page it appears. Dot
 * color = the page's mood_color, dot size = the link role
 * (protagonist large, else small); a polyline connects an entity's
 * dots to show continuity. Clicking a dot navigates to that page.
 *
 * SVG (not Canvas) for click + hover interactivity. Read-only: the
 * data comes from the C4 appearances endpoint (one fetch per entity;
 * fine at storyboard scale).
 *
 * C10 adds relationship lines: when two entities have a relationship
 * (StoryEntity.relationships) AND appear on the same page, a subtle
 * colour-coded bezier connects their lane dots at that page column.
 * Behind the dots, opacity ~0.5, gated by a "Show relationships"
 * toggle (default off to keep the default view uncluttered + cheap).
 */

import {useEffect, useMemo, useState} from "react"

import {
    api,
    type Page,
    type StoryEntityLinkOut,
    type StoryEntityOut,
} from "../api/client"
import {getStorage} from "../storage";
import {useI18n} from "../hooks/useI18n"
import {relationshipColor} from "./relationshipColors"
import {entityTypeColor} from "./storyBibleIcons"
import styles from "./StoryboardArcView.module.css"

interface Props {
    /** Ordered pages (by position) — the x-axis. */
    pages: Page[]
    /** All entities for the book (lanes are the subset with dots). */
    entities: StoryEntityOut[]
    /** Navigate to a page (click a dot). */
    onSelectPage: (pageId: string) => void
    testidNamespace?: string
}

interface Dot {
    pageIndex: number
    pageId: string
    pagePos: number
    moodColor: string | null
    role: string | null
    notes: string | null
}

interface Lane {
    entity: StoryEntityOut
    dots: Dot[]
}

const LABEL_W = 130
const COL_W = 44
const LANE_H = 36
const TOP_H = 26
const DOT_R_LARGE = 7
const DOT_R_SMALL = 4

/** A protagonist/lead role renders a larger dot. */
function dotRadius(role: string | null): number {
    if (!role) return DOT_R_SMALL
    return /protagonist|lead|main/i.test(role) ? DOT_R_LARGE : DOT_R_SMALL
}

export default function StoryboardArcView({
    pages,
    entities,
    onSelectPage,
    testidNamespace = "storyboard-arc",
}: Props) {
    const {t} = useI18n()
    const [linksByEntity, setLinksByEntity] = useState<Record<string, StoryEntityLinkOut[]>>({})
    // C10: relationship lines are off by default (uncluttered + cheap).
    const [showRelationships, setShowRelationships] = useState(false)

    useEffect(() => {
        let cancelled = false
        Promise.all(
            entities.map((e) =>
                getStorage().storyBible
                    .appearances(e.id)
                    .then((rows) => [e.id, rows] as const)
                    .catch(() => [e.id, [] as StoryEntityLinkOut[]] as const),
            ),
        ).then((pairs) => {
            if (!cancelled) setLinksByEntity(Object.fromEntries(pairs))
        })
        return () => {
            cancelled = true
        }
    }, [entities])

    const pageIndex = useMemo(() => {
        const map = new Map<string, {index: number; pos: number; mood: string | null}>()
        pages.forEach((p, i) => map.set(p.id, {index: i, pos: p.position, mood: p.mood_color}))
        return map
    }, [pages])

    const lanes = useMemo<Lane[]>(() => {
        return entities
            .map((entity) => {
                const dots: Dot[] = (linksByEntity[entity.id] ?? [])
                    .map((link) => {
                        if (!link.page_id) return null
                        const pg = pageIndex.get(link.page_id)
                        if (!pg) return null
                        return {
                            pageIndex: pg.index,
                            pageId: link.page_id,
                            pagePos: pg.pos,
                            moodColor: pg.mood,
                            role: link.role,
                            notes: link.notes,
                        }
                    })
                    .filter((d): d is Dot => d !== null)
                    .sort((a, b) => a.pageIndex - b.pageIndex)
                return {entity, dots}
            })
            .filter((lane) => lane.dots.length > 0)
    }, [entities, linksByEntity, pageIndex])

    if (lanes.length === 0) {
        return (
            <div className={styles.empty} data-testid={`${testidNamespace}-empty`}>
                {t(
                    "ui.storyboard.arc_empty",
                    "No entity appearances yet. Drag entities onto pages to build the arc.",
                )}
            </div>
        )
    }

    const width = LABEL_W + pages.length * COL_W
    const height = TOP_H + lanes.length * LANE_H
    const colX = (index: number) => LABEL_W + index * COL_W + COL_W / 2

    // C10: relationship line segments. Built from each lane entity's
    // relationships; a segment is drawn only where BOTH endpoints have
    // a lane AND share a page column. Deduped per unordered-pair + page
    // + type so a reciprocal relationship doesn't double-draw.
    const laneY = (laneIdx: number) => TOP_H + laneIdx * LANE_H + LANE_H / 2
    const laneYById = new Map<string, number>()
    const pageIdxById = new Map<string, Set<number>>()
    lanes.forEach((lane, i) => {
        laneYById.set(lane.entity.id, laneY(i))
        pageIdxById.set(lane.entity.id, new Set(lane.dots.map((d) => d.pageIndex)))
    })
    const nameById = new Map(entities.map((e) => [e.id, e.name]))

    interface RelSeg {
        key: string
        d: string
        color: string
        label: string
    }
    const relSegments: RelSeg[] = []
    if (showRelationships) {
        const seen = new Set<string>()
        for (const lane of lanes) {
            const aId = lane.entity.id
            const yA = laneYById.get(aId)
            if (yA === undefined) continue
            for (const rel of lane.entity.relationships ?? []) {
                const bId = rel.target_entity_id
                const yB = laneYById.get(bId)
                if (yB === undefined) continue
                const aSet = pageIdxById.get(aId)
                const bSet = pageIdxById.get(bId)
                if (!aSet || !bSet) continue
                const lo = aId < bId ? aId : bId
                const hi = aId < bId ? bId : aId
                for (const idx of aSet) {
                    if (!bSet.has(idx)) continue
                    const key = `${lo}-${hi}-${idx}-${rel.relationship_type}`
                    if (seen.has(key)) continue
                    seen.add(key)
                    const x = colX(idx)
                    const off = COL_W * 0.6
                    relSegments.push({
                        key,
                        d: `M ${x},${yA} C ${x + off},${yA} ${x + off},${yB} ${x},${yB}`,
                        color: relationshipColor(rel.relationship_type),
                        label:
                            `${nameById.get(aId) ?? ""} ${t(`ui.story_bible.relationship_type.${rel.relationship_type}`, rel.relationship_type)} ${nameById.get(bId) ?? ""}` +
                            (rel.description ? `: ${rel.description}` : ""),
                    })
                }
            }
        }
    }

    return (
        <div data-testid={`${testidNamespace}-wrap`}>
            <div className={styles.arcToolbar}>
                <label className={styles.relToggle}>
                    <input
                        type="checkbox"
                        checked={showRelationships}
                        onChange={(e) => setShowRelationships(e.target.checked)}
                        data-testid={`${testidNamespace}-relationships-toggle`}
                    />
                    {t("ui.story_bible.relationships_show", "Show relationships")}
                </label>
            </div>
            <div className={styles.scrollX} data-testid={testidNamespace}>
            <svg
                width={width}
                height={height}
                role="img"
                aria-label={t("ui.storyboard.arc_view", "Arc view")}
            >
                {/* C10 relationship lines — rendered first so they sit
                    behind the lane baselines + dots. */}
                {relSegments.length > 0 && (
                    <g data-testid={`${testidNamespace}-relationships`}>
                        {relSegments.map((seg) => (
                            <path
                                key={seg.key}
                                d={seg.d}
                                fill="none"
                                stroke={seg.color}
                                strokeWidth={2}
                                opacity={0.5}
                                className={styles.relationshipLine}
                                data-testid={`${testidNamespace}-rel-${seg.key}`}
                            >
                                <title>{seg.label}</title>
                            </path>
                        ))}
                    </g>
                )}
                {/* Page-position column headers. */}
                {pages.map((p, i) => (
                    <text
                        key={p.id}
                        x={colX(i)}
                        y={16}
                        textAnchor="middle"
                        className={styles.colHeader}
                    >
                        {p.position}
                    </text>
                ))}
                {lanes.map((lane, laneIdx) => {
                    const y = TOP_H + laneIdx * LANE_H + LANE_H / 2
                    const color = entityTypeColor(lane.entity.entity_type)
                    const polyline = lane.dots
                        .map((d) => `${colX(d.pageIndex)},${y}`)
                        .join(" ")
                    return (
                        <g
                            key={lane.entity.id}
                            data-testid={`${testidNamespace}-lane-${lane.entity.id}`}
                        >
                            {/* lane baseline */}
                            <line
                                x1={LABEL_W}
                                y1={y}
                                x2={width}
                                y2={y}
                                className={styles.laneBaseline}
                            />
                            {/* entity label */}
                            <text x={8} y={y + 4} className={styles.laneLabel} fill={color}>
                                {lane.entity.name}
                            </text>
                            {/* continuity polyline */}
                            {lane.dots.length > 1 && (
                                <polyline
                                    points={polyline}
                                    className={styles.continuity}
                                    stroke={color}
                                />
                            )}
                            {/* appearance dots */}
                            {lane.dots.map((d) => (
                                <circle
                                    key={d.pageId}
                                    cx={colX(d.pageIndex)}
                                    cy={y}
                                    r={dotRadius(d.role)}
                                    fill={d.moodColor ?? "var(--text-muted)"}
                                    stroke={color}
                                    className={styles.dot}
                                    data-testid={`${testidNamespace}-dot-${lane.entity.id}-${d.pageId}`}
                                    onClick={() => onSelectPage(d.pageId)}
                                >
                                    <title>
                                        {`${lane.entity.name} — ${t("ui.story_bible.appearance_page", "Page")} ${d.pagePos}` +
                                            (d.role ? ` (${d.role})` : "") +
                                            (d.notes ? `: ${d.notes}` : "")}
                                    </title>
                                </circle>
                            ))}
                        </g>
                    )
                })}
            </svg>
            </div>
        </div>
    )
}
