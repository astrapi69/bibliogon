import { useI18n } from "../../hooks/useI18n";
import { onSharedOrigin } from "../../lib/sharedOrigin";

/**
 * Tells the user that this page's storage is shared with other sites,
 * shown next to a field that takes a credential (#991).
 *
 * Renders nothing unless the page is actually on such an origin, so the
 * desktop, Docker and LAN builds - and a future custom domain - show no
 * notice rather than a warning that does not apply to them.
 *
 * The existing per-field notices already say the credential is stored
 * unencrypted and that a script running in the app can read it. This adds
 * the part the app cannot mitigate: on a path-per-site host the origin
 * itself is shared, so a sibling site on the same host reads the same
 * storage without any script running here at all.
 *
 * @example
 * <input type="password" ... />
 * <SharedOriginNote testId="ai-key-shared-origin-note" />
 */
export function SharedOriginNote({ testId }: { testId?: string }) {
    const { t } = useI18n();
    if (!onSharedOrigin()) return null;
    return (
        <small
            className="mt-1 block text-xs text-[var(--text-muted)]"
            data-testid={testId}
        >
            {t(
                "ui.settings.shared_origin_note",
                "Diese Web-Version läuft auf einem Host, der sich den Speicher mit anderen Seiten desselben Kontos teilt. Wer dort eine Seite veröffentlichen kann, kann diesen Speicher lesen. Für dauerhafte Zugangsdaten ist die Desktop-App die sicherere Wahl.",
            )}
        </small>
    );
}
