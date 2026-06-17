import { useEffect, useMemo, useRef, useState } from "react";

/** A single selectable option. */
export interface ComboboxSelectOption {
    value: string;
    label: string;
}

export interface ComboboxSelectProps {
    /** The selectable options. */
    options: ComboboxSelectOption[];
    /** The current value (matched against ``option.value``). */
    value: string;
    /** Called with the chosen value when an option is selected or a
     *  custom value is committed. */
    onChange: (value: string) => void;
    /** Placeholder shown when the input is empty. */
    placeholder?: string;
    /** When true, a typed value not present in ``options`` (>= 2 chars)
     *  can be committed via the "+ Add" affordance or Enter. */
    allowCustom?: boolean;
    /** Called when a custom value is committed, for persistence. Fires
     *  in addition to ``onChange``. */
    onCustomAdd?: (value: string) => void;
    /** Disables the control. */
    disabled?: boolean;
    /** ``data-testid`` for the input element. */
    testId?: string;
}

/**
 * A dependency-free combobox: a text input paired with a filtered
 * dropdown listbox. Typing filters the options (case-insensitive
 * substring on label OR value); selecting an option calls
 * {@link ComboboxSelectProps.onChange}. With ``allowCustom``, a typed
 * value that matches no option (>= 2 chars after trim) is committable
 * via a "+ Add «X»" row or by pressing Enter.
 *
 * Built from a controlled input plus a conditionally-rendered,
 * absolutely-positioned listbox (NOT a Radix portal), so its open state
 * is fully assertable in Vitest. Closes on outside click and on Escape;
 * ArrowUp/ArrowDown move the active option, Enter selects it.
 *
 * @example
 * ```tsx
 * <ComboboxSelect
 *   options={[{ value: "de", label: "Deutsch" }]}
 *   value={lang}
 *   onChange={setLang}
 *   allowCustom
 *   onCustomAdd={(v) => persistCustomLanguage(v)}
 *   testId="book-language-combobox"
 * />
 * ```
 */
export function ComboboxSelect({
    options,
    value,
    onChange,
    placeholder,
    allowCustom = false,
    onCustomAdd,
    disabled = false,
    testId,
}: ComboboxSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);

    const selectedLabel = useMemo(() => {
        const match = options.find((o) => o.value === value);
        return match ? match.label : value;
    }, [options, value]);

    const inputText = query ?? selectedLabel;

    const filtered = useMemo(() => {
        const q = (query ?? "").trim().toLowerCase();
        if (!q) return options;
        return options.filter(
            (o) =>
                o.label.toLowerCase().includes(q) ||
                o.value.toLowerCase().includes(q),
        );
    }, [options, query]);

    const trimmedQuery = (query ?? "").trim();
    const isCommittableCustom =
        allowCustom &&
        trimmedQuery.length >= 2 &&
        !options.some(
            (o) => o.value.toLowerCase() === trimmedQuery.toLowerCase(),
        );

    // Commit a pending custom value when the dropdown closes by losing
    // focus (outside click / blur), instead of silently discarding it.
    // Without this, typing a custom value (e.g. a custom book language)
    // and then clicking a Submit/Save button outside the combobox drops
    // the typed text and reverts to the previous value. Held in a ref so
    // the (open-scoped) outside-click effect always sees the latest query
    // without re-subscribing on every keystroke.
    const closeRef = useRef<() => void>(() => {});
    closeRef.current = () => {
        if (isCommittableCustom) {
            onChange(trimmedQuery);
            onCustomAdd?.(trimmedQuery);
        }
        setQuery(null);
        setOpen(false);
    };

    useEffect(() => {
        if (!open) return;
        const handleMouseDown = (event: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(event.target as Node)) {
                closeRef.current();
            }
        };
        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [open]);

    const totalRows = filtered.length + (isCommittableCustom ? 1 : 0);

    const commitOption = (option: ComboboxSelectOption) => {
        onChange(option.value);
        setQuery(null);
        setOpen(false);
    };

    const commitCustom = () => {
        if (!isCommittableCustom) return;
        onChange(trimmedQuery);
        onCustomAdd?.(trimmedQuery);
        setQuery(null);
        setOpen(false);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) setOpen(true);
            setActiveIndex((i) => (totalRows === 0 ? 0 : (i + 1) % totalRows));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
            setActiveIndex((i) =>
                totalRows === 0 ? 0 : (i - 1 + totalRows) % totalRows,
            );
        } else if (event.key === "Enter") {
            if (!open) return;
            event.preventDefault();
            if (activeIndex < filtered.length) {
                commitOption(filtered[activeIndex]);
            } else if (isCommittableCustom) {
                commitCustom();
            }
        } else if (event.key === "Escape") {
            setOpen(false);
            setQuery(null);
        }
    };

    return (
        <div ref={rootRef} className="relative">
            <input
                className="input"
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                value={inputText}
                placeholder={placeholder}
                disabled={disabled}
                data-testid={testId}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                    setOpen(true);
                }}
                onFocus={() => {
                    if (!disabled) setOpen(true);
                }}
                onKeyDown={handleKeyDown}
            />
            {open && totalRows > 0 && (
                <ul
                    role="listbox"
                    data-testid={testId ? `${testId}-listbox` : undefined}
                    className="absolute left-0 right-0 top-full z-[2100] mt-1 max-h-60 list-none overflow-auto bg-card border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-0"
                >
                    {filtered.map((option, index) => {
                        const active = index === activeIndex;
                        return (
                            <li
                                key={option.value}
                                role="option"
                                aria-selected={option.value === value}
                                data-testid={
                                    testId
                                        ? `${testId}-option-${option.value}`
                                        : undefined
                                }
                                className={`flex min-h-[44px] cursor-pointer items-center px-3 py-2 text-[color:var(--text-primary)] ${
                                    active
                                        ? "bg-[var(--bg-hover)] text-[color:var(--accent)]"
                                        : ""
                                }`}
                                onMouseEnter={() => setActiveIndex(index)}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    commitOption(option);
                                }}
                            >
                                {option.label}
                            </li>
                        );
                    })}
                    {isCommittableCustom && (
                        <li
                            role="option"
                            aria-selected={false}
                            data-testid={
                                testId ? `${testId}-custom-add` : undefined
                            }
                            className={`flex min-h-[44px] cursor-pointer items-center px-3 py-2 text-[color:var(--text-primary)] ${
                                activeIndex === filtered.length
                                    ? "bg-[var(--bg-hover)] text-[color:var(--accent)]"
                                    : ""
                            }`}
                            onMouseEnter={() => setActiveIndex(filtered.length)}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                commitCustom();
                            }}
                        >
                            + {`Add «${trimmedQuery}»`}
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}

export default ComboboxSelect;
