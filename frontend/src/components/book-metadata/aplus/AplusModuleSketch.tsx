import type { AplusModuleTemplate, AplusSketchCell } from "../../../lib/utils/aplus/moduleTemplates";

const CELL_CLASS: Record<AplusSketchCell, string> = {
    image: "aspect-square rounded-[2px] border border-[var(--border)] bg-[var(--bg-hover)]",
    wide: "h-8 rounded-[2px] border border-[var(--border)] bg-[var(--bg-hover)]",
    tall: "h-full min-h-8 rounded-[2px] border border-[var(--border)] bg-[var(--bg-hover)]",
    text: "flex flex-col justify-center gap-[3px]",
    logo: "mx-auto h-5 w-2/3 rounded-full border border-[var(--border)] bg-[var(--bg-hover)]",
    overlay: "relative h-10 rounded-[2px] border border-[var(--border)] bg-[var(--bg-hover)]",
    overlay_dark: "relative h-10 rounded-[2px] border border-[var(--border)] bg-[var(--bg-hover)]",
    table: "grid grid-rows-3 gap-[2px]",
};

function Cell({ kind }: { kind: AplusSketchCell }) {
    if (kind === "text") {
        return (
            <div className={CELL_CLASS.text}>
                <span className="h-[3px] w-4/5 rounded bg-[var(--border)]" />
                <span className="h-[3px] w-full rounded bg-[var(--border)]" />
                <span className="h-[3px] w-3/5 rounded bg-[var(--border)]" />
            </div>
        );
    }
    if (kind === "table") {
        return (
            <div className={CELL_CLASS.table}>
                <span className="h-[4px] rounded bg-[var(--border)]" />
                <span className="h-[4px] rounded bg-[var(--border)]" />
                <span className="h-[4px] rounded bg-[var(--border)]" />
            </div>
        );
    }
    if (kind === "overlay" || kind === "overlay_dark") {
        const box = kind === "overlay_dark" ? "bg-[var(--text-muted)]" : "bg-[var(--accent-light)]";
        return (
            <div className={CELL_CLASS[kind]}>
                <span className={`absolute left-2 top-2 h-5 w-1/3 rounded-[2px] ${box}`} />
            </div>
        );
    }
    return <div className={CELL_CLASS[kind]} />;
}

/**
 * Small wireframe of an A+ module's layout (#895), drawn from the template's
 * `sketch` rows so a tile shows where images and texts sit.
 *
 * @example
 * <AplusModuleSketch template={findTemplate("three_images_text")!} />
 */
export default function AplusModuleSketch({ template }: { template: AplusModuleTemplate }) {
    return (
        <div
            className="flex w-full flex-col gap-1 rounded-[var(--radius-sm)] bg-[var(--bg-card)] p-2"
            data-testid={`aplus-sketch-${template.id}`}
            aria-hidden="true"
        >
            {template.sketch.map((row, i) => (
                <div key={i} className="grid items-stretch gap-1" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                    {row.map((kind, j) => (
                        <Cell key={j} kind={kind} />
                    ))}
                </div>
            ))}
        </div>
    );
}
