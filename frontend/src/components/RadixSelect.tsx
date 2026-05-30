import * as Select from "@radix-ui/react-select";
import {ChevronDown as ChevronDownIcon} from "lucide-react";

export type RadixSelectOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

export interface RadixSelectProps {
    value: string;
    onValueChange: (value: string) => void;
    options: RadixSelectOption[];
    testId?: string;
    /** Shown when the current value is empty / unmatched. Use this
     * instead of an option with value="" (Radix forbids empty Item
     * values). */
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
    id?: string;
    /** Extra class appended to the trigger / native select. */
    className?: string;
    /** Native-form name (only meaningful in the test-mode <select>). */
    name?: string;
}

/**
 * Themed single-select dropdown — the canonical app-wide select.
 *
 * Renders a Radix Select in the browser (portal-based, fully themed
 * via the global .radix-select-* tokens) and a native <select> under
 * Vitest/happy-dom, where the Radix portal is unreliable (see
 * lessons-learned "Radix DropdownMenu + happy-dom is brittle for
 * Vitest"). BOTH modes expose the same `${testId}-trigger` test id and
 * the same value / onValueChange contract, so consumer Vitest specs
 * using getByTestId(`${testId}-trigger`) + fireEvent.change keep
 * working without ever opening the portal. Open-menu / option-click
 * coverage belongs in Playwright E2E.
 *
 * Radix Select forbids an empty-string Item value; pass `placeholder`
 * for the "nothing selected" affordance rather than an option with
 * value="". The test-mode native render adds a hidden empty option so
 * a "" value still round-trips.
 *
 * 2026-05-30 component-consistency sweep (Session 2B): widened from the
 * Settings-only original into the canonical dropdown used everywhere
 * native <select> used to be.
 */
const IS_TEST = import.meta.env.MODE === "test";

export function RadixSelect({
    value,
    onValueChange,
    options,
    testId,
    placeholder,
    disabled,
    ariaLabel,
    id,
    className,
    name,
}: RadixSelectProps) {
    const triggerTestId = testId ? `${testId}-trigger` : undefined;
    const triggerClass = className
        ? `radix-select-trigger ${className}`
        : "radix-select-trigger";

    if (IS_TEST) {
        return (
            <select
                id={id}
                name={name}
                className={triggerClass}
                data-testid={triggerTestId}
                aria-label={ariaLabel}
                disabled={disabled}
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
            >
                {placeholder !== undefined && (
                    <option value="" disabled hidden>
                        {placeholder}
                    </option>
                )}
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                        {opt.label}
                    </option>
                ))}
            </select>
        );
    }

    return (
        <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
            <Select.Trigger
                id={id}
                className={triggerClass}
                data-testid={triggerTestId}
                aria-label={ariaLabel}
            >
                <Select.Value placeholder={placeholder} />
                <Select.Icon>
                    <ChevronDownIcon size={14} />
                </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
                <Select.Content
                    className="radix-select-content"
                    position="popper"
                    sideOffset={4}
                >
                    <Select.Viewport>
                        {options
                            .filter((opt) => opt.value !== "")
                            .map((opt) => (
                                <Select.Item
                                    key={opt.value}
                                    value={opt.value}
                                    disabled={opt.disabled}
                                    className="radix-select-item"
                                    data-testid={
                                        testId ? `${testId}-item-${opt.value}` : undefined
                                    }
                                >
                                    <Select.ItemText>{opt.label}</Select.ItemText>
                                </Select.Item>
                            ))}
                    </Select.Viewport>
                </Select.Content>
            </Select.Portal>
        </Select.Root>
    );
}
