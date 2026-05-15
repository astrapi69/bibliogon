import * as Select from "@radix-ui/react-select";
import {ChevronDown as ChevronDownIcon} from "lucide-react";

export function RadixSelect({value, onValueChange, options, testId}: {
    value: string;
    onValueChange: (value: string) => void;
    options: {value: string; label: string}[];
    testId?: string;
}) {
    return (
        <Select.Root value={value} onValueChange={onValueChange}>
            <Select.Trigger
                className="radix-select-trigger"
                data-testid={testId ? `${testId}-trigger` : undefined}
            >
                <Select.Value/>
                <Select.Icon>
                    <ChevronDownIcon size={14}/>
                </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
                <Select.Content className="radix-select-content" position="popper" sideOffset={4}>
                    <Select.Viewport>
                        {options.map((opt) => (
                            <Select.Item
                                key={opt.value}
                                value={opt.value}
                                className="radix-select-item"
                                data-testid={testId ? `${testId}-item-${opt.value}` : undefined}
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
