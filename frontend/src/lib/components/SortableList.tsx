import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * The dnd-kit bag handed to each rendered item. Spread `attributes` +
 * `listeners` onto whichever element should grab the drag (the whole row
 * or a dedicated handle), attach `setNodeRef` to the sortable element, and
 * apply `style` (which carries the transform + transition) to it.
 */
export interface SortableItemRenderProps {
  /** Accessibility attributes for the draggable element. */
  attributes: ReturnType<typeof useSortable>["attributes"];
  /** Pointer / keyboard drag listeners. */
  listeners: ReturnType<typeof useSortable>["listeners"];
  /** Ref callback for the sortable DOM node. */
  setNodeRef: (node: HTMLElement | null) => void;
  /** CSS `transform` + `transition` for the in-flight drag animation. */
  style: React.CSSProperties;
  /** True while this item is the one being dragged. */
  isDragging: boolean;
}

/**
 * Wires a single item to dnd-kit's `useSortable` and exposes the dnd bag
 * to a render-prop child, so callers keep full control over their markup
 * (and their `data-testid`s). Standalone export so a caller can compose
 * its own `DndContext`/`SortableContext` and still reuse the per-item
 * wiring; most callers use {@link SortableList} which composes both.
 */
export function SortableItem({
  id,
  children,
}: {
  id: string;
  children: (props: SortableItemRenderProps) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return <>{children({ attributes, listeners, setNodeRef, style, isDragging })}</>;
}

/**
 * Generic drag-sortable list. A thin wrapper around dnd-kit's
 * `DndContext` + `SortableContext` that owns the sensors and the
 * drag-end reorder math, and renders each item through a render-prop so
 * callers keep their exact markup + `data-testid`s.
 *
 * Sensors are fixed to the project's canonical pair: a `PointerSensor`
 * with a 5px activation distance and a `KeyboardSensor` using
 * `sortableKeyboardCoordinates`. Collision detection is `closestCenter`.
 * On a drop the component computes the new id order via `arrayMove` and
 * hands it to `onReorder` — the caller decides what to do with it (set
 * state, merge into a larger collection, etc.).
 *
 * @typeParam T - the item shape.
 *
 * @example
 * ```tsx
 * <SortableList
 *   items={chapters}
 *   getId={(c) => c.id}
 *   onReorder={(orderedIds) => save(orderedIds)}
 *   renderItem={(chapter, dnd) => (
 *     <div ref={dnd.setNodeRef} style={dnd.style} data-testid={`row-${chapter.id}`}>
 *       <span {...dnd.attributes} {...dnd.listeners}>drag</span>
 *       {chapter.title}
 *     </div>
 *   )}
 * />
 * ```
 */
export function SortableList<T>({
  items,
  getId,
  renderItem,
  onReorder,
  strategy = verticalListSortingStrategy,
}: {
  /** The items to render, in display order. */
  items: T[];
  /** Stable id extractor for each item. */
  getId: (item: T) => string;
  /** Renders one item; receives the item and its dnd bag. */
  renderItem: (item: T, dnd: SortableItemRenderProps) => React.ReactNode;
  /** Called on drop with the full new id order (already `arrayMove`d). */
  onReorder: (orderedIds: string[]) => void;
  /** Sorting strategy (default {@link verticalListSortingStrategy}). */
  strategy?: SortingStrategy;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = items.map((item) => getId(item));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={strategy}>
        {items.map((item) => (
          <SortableItem key={getId(item)} id={getId(item)}>
            {(dnd) => renderItem(item, dnd)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}
