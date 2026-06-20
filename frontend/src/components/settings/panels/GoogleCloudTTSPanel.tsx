import React, {useCallback, useEffect, useRef, useState} from "react";
import {Upload, Trash2} from "lucide-react";
import {api} from "../../../api/client";
import {useI18n} from "../../../hooks/useI18n";
import {notify} from "../../../utils/platform/notify";
import {HelpText} from "../HelpText";

export function GoogleCloudTTSPanel() {
    const {t} = useI18n();
    const [config, setConfig] = useState<{
        configured: boolean;
        project_id?: string;
        client_email?: string;
        seeding_done?: boolean;
        seeding_error?: string | null;
        voice_count?: number;
    } | null>(null);
    const [busy, setBusy] = useState(false);
    const pollRef = useRef<number | null>(null);

    const load = useCallback(async () => {
        try {
            const c = await api.audiobook.getGoogleCloudConfig();
            setConfig(c);
            return c;
        } catch {
            setConfig({configured: false});
            return {configured: false} as {configured: boolean; seeding_done?: boolean};
        }
    }, []);

    useEffect(() => {
        load();
        return () => {
            if (pollRef.current !== null) clearInterval(pollRef.current);
        };
    }, [load]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy(true);
        try {
            await api.audiobook.uploadGoogleCloudCredentials(file);
            notify.success(t("ui.audiobook.google_uploaded", "Google Cloud Credentials gespeichert. Stimmen werden geladen..."));
            // Poll until seeding is done
            pollRef.current = window.setInterval(async () => {
                const c = await load();
                if (c.seeding_done !== false) {
                    if (pollRef.current !== null) clearInterval(pollRef.current);
                    pollRef.current = null;
                    if (c.seeding_done && !("seeding_error" in c && c.seeding_error)) {
                        notify.success(
                            t("ui.audiobook.google_seeded", "Stimmen geladen") +
                            (config?.voice_count ? ` (${config.voice_count})` : ""),
                        );
                    }
                }
            }, 2000);
        } catch (err) {
            notify.error(t("ui.audiobook.google_upload_failed", "Upload fehlgeschlagen"), err);
        }
        setBusy(false);
        e.target.value = "";
    };

    const handleTest = async () => {
        setBusy(true);
        try {
            const r = await api.audiobook.testGoogleCloudCredentials();
            if (r.valid) {
                notify.success(t("ui.audiobook.google_test_ok", "Verbindung erfolgreich") + (r.message ? `: ${r.message}` : ""));
            } else {
                notify.error(t("ui.audiobook.google_test_failed", "Verbindung fehlgeschlagen") + (r.message ? `: ${r.message}` : ""));
            }
        } catch (err) {
            notify.error(t("ui.audiobook.google_test_failed", "Verbindung fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const handleRemove = async () => {
        setBusy(true);
        try {
            await api.audiobook.deleteGoogleCloudCredentials();
            setConfig({configured: false});
            notify.success(t("ui.audiobook.google_removed", "Google Cloud Credentials entfernt"));
        } catch (err) {
            notify.error(t("ui.audiobook.google_remove_failed", "Entfernen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    return (
        <div style={{
            marginTop: 24, paddingTop: 16,
            borderTop: "1px solid var(--border)",
        }}>
            <h4 style={{
                fontSize: "0.8125rem", fontWeight: 600,
                color: "var(--text-muted)", marginBottom: 8,
            }}>
                Google Cloud Text-to-Speech
            </h4>

            {config?.configured ? (
                <>
                    <div style={{fontSize: "0.75rem", color: "var(--accent)", marginBottom: 4}}>
                        {t("ui.audiobook.google_connected", "Verbunden")}
                        {config.project_id && ` - ${config.project_id}`}
                    </div>
                    {config.client_email && (
                        <div style={{fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8}}>
                            {config.client_email}
                        </div>
                    )}
                    {config.seeding_done === false && (
                        <div style={{fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8}}>
                            {t("ui.audiobook.google_seeding", "Stimmen werden geladen...")}
                        </div>
                    )}
                    {config.seeding_error && (
                        <div style={{fontSize: "0.75rem", color: "var(--danger, #c0392b)", marginBottom: 8}}>
                            {t("ui.audiobook.google_seeding_error", "Fehler beim Laden der Stimmen")}: {config.seeding_error}
                        </div>
                    )}
                    {config.voice_count && config.voice_count > 0 && (
                        <div style={{fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8}}>
                            {config.voice_count} {t("ui.audiobook.google_voices_count", "Stimmen verfügbar")}
                        </div>
                    )}
                    <div style={{display: "flex", gap: 8, flexWrap: "wrap"}}>
                        <button className="btn btn-secondary btn-sm" onClick={handleTest} disabled={busy}>
                            {t("ui.audiobook.elevenlabs_test", "Testen")}
                        </button>
                        <button
                            className="btn btn-ghost btn-sm" onClick={handleRemove} disabled={busy}
                            style={{color: "var(--danger, #c0392b)"}}
                        >
                            <Trash2 size={12}/> {t("ui.audiobook.elevenlabs_remove", "Entfernen")}
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <HelpText style={{marginTop: 0, marginBottom: 8}}>
                        {t(
                            "ui.audiobook.google_hint",
                            "Google Cloud Console > Projekt > Cloud Text-to-Speech API aktivieren > Service Account erstellen > JSON-Key herunterladen.",
                        )}
                    </HelpText>
                    <label className="btn btn-secondary btn-sm" style={{cursor: "pointer"}}>
                        <Upload size={12}/>
                        {" "}
                        {t("ui.audiobook.google_upload", "Service Account JSON hochladen")}
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleUpload}
                            disabled={busy}
                            style={{display: "none"}}
                        />
                    </label>
                </>
            )}
        </div>
    );
}
