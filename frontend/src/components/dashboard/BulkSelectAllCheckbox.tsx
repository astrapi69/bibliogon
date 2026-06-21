/** Tri-state "select all" checkbox for the dashboard bulk-action
 *  surfaces. Checked when every visible row is selected, indeterminate
 *  when some are, unchecked when none are. Toggling on selects the full
 *  set (caller supplies the id list via ``onSelectAll``); toggling off
 *  clears. Shared as-is by the Books + Articles dashboards. */
export default function BulkSelectAllCheckbox({
    count,
    total,
    onSelectAll,
    onClear,
    label,
    testId,
    className,
}: {
    count: number;
    total: number;
    onSelectAll: () => void;
    onClear: () => void;
    label: string;
    testId: string;
    className?: string;
}) {
    return (
        <div className={className}>
            <label>
                <input
                    type="checkbox"
                    data-testid={testId}
                    checked={count > 0 && count === total}
                    ref={(el) => {
                        if (el) el.indeterminate = count > 0 && count < total;
                    }}
                    onChange={(e) => {
                        if (e.target.checked) {
                            onSelectAll();
                        } else {
                            onClear();
                        }
                    }}
                />{" "}
                {label}
            </label>
        </div>
    );
}
