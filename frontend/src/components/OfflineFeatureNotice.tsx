import {Laptop} from "lucide-react";

import {useOfflineFeatureGate} from "../storage/useOfflineFeatureGate";

/**
 * Body shown in place of a backend-only page when running on the backendless
 * offline (Dexie) build - e.g. Export, Git, Medium import. Replaces the page
 * content so its mount fetches never fire a dead `/api` request. Styling is
 * Tailwind-only against the mapped theme tokens.
 */
export function OfflineFeatureNotice({testId}: {testId?: string}) {
    const {message} = useOfflineFeatureGate();
    return (
        <div
            className="flex flex-col items-center gap-[12px] py-[48px] text-center text-muted-foreground"
            data-testid={testId ?? "offline-feature-notice"}
        >
            <Laptop size={40} strokeWidth={1.5} />
            <p className="max-w-[420px]">{message}</p>
        </div>
    );
}
