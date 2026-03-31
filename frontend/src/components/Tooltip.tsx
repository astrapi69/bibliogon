import * as RadixTooltip from "@radix-ui/react-tooltip";

interface Props {
    content: string;
    children: React.ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    delayDuration?: number;
}

export default function Tooltip({content, children, side = "top", delayDuration = 300}: Props) {
    return (
        <RadixTooltip.Provider delayDuration={delayDuration}>
            <RadixTooltip.Root>
                <RadixTooltip.Trigger asChild>
                    {children}
                </RadixTooltip.Trigger>
                <RadixTooltip.Portal>
                    <RadixTooltip.Content className="radix-tooltip-content" side={side} sideOffset={4}>
                        {content}
                        <RadixTooltip.Arrow className="radix-tooltip-arrow"/>
                    </RadixTooltip.Content>
                </RadixTooltip.Portal>
            </RadixTooltip.Root>
        </RadixTooltip.Provider>
    );
}
