/**
 * Bulk-selection checkbox overlaid on a dashboard card tile (Books +
 * Articles grid views). Positioned at the tile's top-left corner; on
 * coarse pointers the clickable area expands to the 44px touch-target
 * minimum (WCAG 2.5.5 / TOUCH-TARGETS) via a negative-margin padding
 * box, so the visible 18px checkbox stays put while the tap area grows
 * (issue #273). ``stopPropagation`` on both the wrapping label and the
 * input keeps a checkbox click from bubbling up to the tile's
 * click-to-open handler.
 *
 * @param checked - Whether the tile is selected.
 * @param onToggle - Toggles the tile's selection.
 * @param testId - data-testid for the input.
 * @param ariaLabel - Accessible label for the checkbox.
 */

interface Props {
    checked: boolean;
    onToggle: () => void;
    testId: string;
    ariaLabel: string;
}

export default function TileSelectCheckbox({ checked, onToggle, testId, ariaLabel }: Props) {
    return (
        <label
            className="absolute left-2 top-2 z-[5] flex cursor-pointer items-center justify-center p-0 pointer-coarse:-m-[13px] pointer-coarse:p-[13px]"
            onClick={(e) => e.stopPropagation()}
        >
            <input
                type="checkbox"
                className="h-[18px] w-[18px] cursor-pointer"
                data-testid={testId}
                checked={checked}
                onChange={onToggle}
                onClick={(e) => e.stopPropagation()}
                aria-label={ariaLabel}
            />
        </label>
    );
}
