import type { BaseUrlChange } from "./scrubSecrets";

/**
 * Builds the confirmation a restore asks before it moves the endpoint a
 * configured AI key talks to (#985).
 *
 * Shared because both restore surfaces need it - Settings > Backups and
 * the Data-Management card - and a second copy of the wording would
 * drift. The detection itself is `baseUrlChangesBesideKeys`; this is
 * only how the finding is put to the user.
 *
 * Declining is the safe answer and the dialog says what it costs: the
 * endpoints stay, everything else in the bundle still restores.
 *
 * @param confirm - `useDialog().confirm`.
 * @param t - `useI18n().t`.
 *
 * @example
 * await restoreBackupFile(file, makeBaseUrlConfirm(dialog.confirm, t))
 */
export function makeBaseUrlConfirm(
    confirm: (
        title: string,
        message: string,
        variant?: "default" | "danger" | "success" | "info",
    ) => Promise<boolean>,
    t: (key: string, fallback: string) => string,
): (changes: BaseUrlChange[]) => Promise<boolean> {
    return (changes) =>
        confirm(
            t(
                "ui.backups.base_url_confirm_title",
                "Endpunkt eines gespeicherten Schlüssels ändern?",
            ),
            [
                t(
                    "ui.backups.base_url_confirm_message",
                    "Das Backup richtet einen Dienst anders aus, für den auf diesem Gerät ein Schlüssel gespeichert ist. Abbrechen behält die bisherigen Endpunkte; alles andere wird trotzdem wiederhergestellt.",
                ),
                "",
                ...changes.map(
                    (change) =>
                        `${
                            change.provider ||
                            t(
                                "ui.backups.base_url_active_provider",
                                "aktiver Anbieter",
                            )
                        }: ${change.from || "-"} -> ${change.to}`,
                ),
            ].join("\n"),
            "danger",
        );
}
