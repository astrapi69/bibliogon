/**
 * Notice card for a feature that is `disabled` in the current deployment
 * (policy #78: user-owned features are never hidden - they stay visible and
 * explained). Renders the feature's reason (an i18n key carried on the
 * {@link FeatureHandle}) inside a non-interactive card, so a whole section or
 * page can show *why* a control is unavailable instead of rendering dead,
 * greyed-out controls.
 *
 * @param reason - the i18n key from `useFeature(id).reason`; falls back to the
 *   generic desktop-app message.
 * @param testId - optional test id (defaults to `feature-notice`).
 */

import { useI18n } from "../hooks/useI18n";
import { FEATURE_REASON } from "./featureConfig";

export function FeatureNotice({
    reason,
    testId = "feature-notice",
}: {
    reason?: string;
    testId?: string;
}) {
    const { t } = useI18n();
    return (
        <div
            data-testid={testId}
            role="status"
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]"
        >
            {t(
                reason ?? FEATURE_REASON.REQUIRES_DESKTOP_APP,
                "This feature requires the Bibliogon desktop app",
            )}
        </div>
    );
}
