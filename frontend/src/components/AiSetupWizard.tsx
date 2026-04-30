/**
 * First-run AI provider setup wizard.
 *
 * Shows on the Dashboard when AI is not yet configured (ai.enabled === false
 * and no "bibliogon-ai-setup-dismissed" flag in localStorage). Three steps:
 * 1. Pick a provider
 * 2. Enter API key + model
 * 3. Test connection
 *
 * On completion, the AI config is saved via PATCH /api/settings/app and
 * the wizard sets a localStorage flag so it won't show again.
 */

import {useState} from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {Sparkles, X, ChevronRight, ChevronLeft, Check, Eye, EyeOff} from "lucide-react"
import {useI18n} from "../hooks/useI18n"
import {notify} from "../utils/notify"
import {api} from "../api/client"
import {AI_PROVIDER_PRESETS, AI_PROVIDER_IDS, getProviderPreset} from "../utils/aiProviders"

const DISMISSED_KEY = "bibliogon-ai-setup-dismissed"

interface Props {
  open: boolean
  onClose: () => void
  /** True when the backend reports ai.api_key comes from
   *  ~/.config/bibliogon/secrets.yaml or BIBLIOGON_AI_API_KEY.
   *  Wizard hides the API-key input + skips its validation; the
   *  user has already configured the key out-of-band, the wizard
   *  must not block them from completing setup. */
  secretsManagedExternally?: boolean
}

export default function AiSetupWizard({open, onClose, secretsManagedExternally = false}: Props) {
  const {t} = useI18n()
  const [step, setStep] = useState(0)
  const [provider, setProvider] = useState("anthropic")
  const [baseUrl, setBaseUrl] = useState(AI_PROVIDER_PRESETS.anthropic.base_url)
  const [model, setModel] = useState(AI_PROVIDER_PRESETS.anthropic.default_model)
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<"idle" | "ok" | "fail">("idle")
  const [saving, setSaving] = useState(false)

  const preset = getProviderPreset(provider)
  // Externally-managed key already exists; no input needed even for
  // providers that nominally require one.
  const needsKey = preset?.requires_api_key !== false && !secretsManagedExternally

  const handleProviderChange = (pid: string) => {
    setProvider(pid)
    const p = getProviderPreset(pid)
    if (p) {
      setBaseUrl(p.base_url)
      setModel(p.default_model)
      setApiKey("")
      setTestResult("idle")
    }
  }

  const buildAiPayload = (): Record<string, unknown> => {
    const ai: Record<string, unknown> = {
      enabled: true,
      provider,
      base_url: baseUrl,
      model,
      temperature: 0.7,
      max_tokens: 2048,
    }
    // Skip api_key when managed externally; backend would strip it
    // anyway with a defensive WARNING log, but stripping client-side
    // keeps logs quiet and avoids the round-trip.
    if (!secretsManagedExternally) {
      ai.api_key = apiKey
    }
    return ai
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult("idle")
    try {
      // Save first so the backend sees the config
      await api.settings.updateApp({ai: buildAiPayload()})
      const resp = await fetch("/api/ai/test-connection")
      if (resp.ok) {
        const data = await resp.json()
        if (data.success) {
          setTestResult("ok")
          notify.success(t("ui.settings.ai_test_ok", "Verbindung erfolgreich"))
        } else {
          setTestResult("fail")
          const detail = data.error_detail || ""
          const msg = detail
            ? `${t("ui.settings.ai_test_fail", "Verbindung fehlgeschlagen")}: ${detail}`
            : t("ui.settings.ai_test_fail", "Verbindung fehlgeschlagen")
          notify.warning(msg)
        }
      } else {
        setTestResult("fail")
        notify.error(t("ui.settings.ai_test_fail", "Verbindung fehlgeschlagen"))
      }
    } catch {
      setTestResult("fail")
      notify.error(t("ui.settings.ai_test_fail", "Verbindung fehlgeschlagen"))
    }
    setTesting(false)
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      await api.settings.updateApp({ai: buildAiPayload()})
      localStorage.setItem(DISMISSED_KEY, "true")
      notify.success(t("ui.ai_wizard.done", "KI-Assistent eingerichtet"))
      onClose()
    } catch {
      notify.error(t("ui.common.error", "Fehler"))
    }
    setSaving(false)
  }

  const handleSkip = () => {
    localStorage.setItem(DISMISSED_KEY, "true")
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) handleSkip() }}>
      <Dialog.Portal>
        <Dialog.Overlay style={styles.overlay}/>
        <Dialog.Content style={styles.content}>
          <Dialog.Title style={styles.title}>
            <Sparkles size={18}/>
            {t("ui.ai_wizard.title", "KI-Assistent einrichten")}
          </Dialog.Title>

          {/* Step indicator */}
          <div style={styles.steps}>
            {[0, 1, 2].map((s) => (
              <div key={s} style={{
                ...styles.stepDot,
                background: s === step ? "var(--accent)" : s < step ? "var(--success, #22c55e)" : "var(--border)",
              }}/>
            ))}
          </div>

          {/* Step 0: Pick provider */}
          {step === 0 && (
            <div style={styles.stepContent}>
              <p style={styles.hint}>{t("ui.ai_wizard.step1_hint", "Wähle deinen KI-Anbieter. Du kannst dies später in den Einstellungen aendern.")}</p>
              <div style={styles.providerGrid}>
                {AI_PROVIDER_IDS.map((pid) => {
                  const p = AI_PROVIDER_PRESETS[pid]
                  return (
                    <button
                      key={pid}
                      className={`btn ${provider === pid ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => handleProviderChange(pid)}
                      style={styles.providerBtn}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 1: API key + model */}
          {step === 1 && (
            <div style={styles.stepContent}>
              {secretsManagedExternally ? (
                <div className="field" data-testid="wizard-api-key-external-note">
                  <label className="label">{t("ui.settings.ai_api_key", "API Key")}</label>
                  <div style={{
                    padding: 12,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-muted)",
                    fontSize: "0.8125rem",
                  }}>
                    {t(
                      "ui.settings.ai_api_key_external_note",
                      "API-Schlüssel wird aus externer Konfiguration gelesen (~/.config/bibliogon/secrets.yaml oder Umgebungsvariable BIBLIOGON_AI_API_KEY). Editiere die Datei direkt oder setze die Umgebungsvariable, um den Schlüssel zu ändern.",
                    )}
                  </div>
                </div>
              ) : needsKey ? (
                <>
                  <div className="field">
                    <label className="label">{t("ui.settings.ai_api_key", "API Key")}</label>
                    <div style={{display: "flex", gap: 8}}>
                      <input
                        className="input"
                        data-testid="wizard-api-key-input"
                        type={showKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => { setApiKey(e.target.value); setTestResult("idle") }}
                        placeholder="sk-..."
                        style={{flex: 1, fontFamily: "var(--font-mono)", fontSize: "0.8125rem"}}
                        autoFocus
                      />
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowKey(!showKey)}>
                        {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                      </button>
                    </div>
                    <small style={{color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 4, display: "block"}}>
                      {t("ui.settings.ai_key_hint", "Der API-Schlüssel wird nur lokal gespeichert.")}
                    </small>
                  </div>
                </>
              ) : (
                <p style={styles.hint}>{t("ui.ai_wizard.no_key_needed", "LM Studio benötigt keinen API-Schlüssel. Stelle sicher, dass der Server läuft.")}</p>
              )}
              <div className="field">
                <label className="label">{t("ui.settings.ai_model", "Modell")}</label>
                <input
                  className="input"
                  value={model}
                  onChange={(e) => { setModel(e.target.value); setTestResult("idle") }}
                  list="wizard-model-suggestions"
                  placeholder={!needsKey ? t("ui.settings.ai_model_lmstudio", "Vom Server bereitgestellt") : ""}
                  style={{fontFamily: "var(--font-mono)", fontSize: "0.8125rem"}}
                />
                <datalist id="wizard-model-suggestions">
                  {(preset?.model_suggestions || []).map((m) => (
                    <option key={m} value={m}/>
                  ))}
                </datalist>
              </div>
            </div>
          )}

          {/* Step 2: Test connection */}
          {step === 2 && (
            <div style={styles.stepContent}>
              <p style={styles.hint}>{t("ui.ai_wizard.step3_hint", "Teste die Verbindung zu deinem KI-Anbieter.")}</p>
              <div style={{display: "flex", alignItems: "center", gap: 12, marginTop: 8}}>
                <button
                  className="btn btn-primary"
                  onClick={handleTest}
                  disabled={testing}
                >
                  {testing ? t("ui.common.loading", "Laden...") : t("ui.settings.ai_test", "Verbindung testen")}
                </button>
                {testResult === "ok" && <span style={{color: "var(--success, #22c55e)", display: "flex", alignItems: "center", gap: 4}}><Check size={16}/> {t("ui.settings.ai_test_ok", "Verbindung erfolgreich")}</span>}
                {testResult === "fail" && <span style={{color: "var(--error, #ef4444)", fontSize: "0.8125rem"}}>{t("ui.settings.ai_test_fail", "Fehlgeschlagen")}</span>}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={styles.nav}>
            <button className="btn btn-ghost btn-sm" onClick={handleSkip}>
              {t("ui.ai_wizard.skip", "Überspringen")}
            </button>
            <div style={{display: "flex", gap: 8}}>
              {step > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)}>
                  <ChevronLeft size={14}/> {t("ui.common.back", "Zurück")}
                </button>
              )}
              {step < 2 ? (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && needsKey && !apiKey.trim()}
                >
                  {t("ui.common.next", "Weiter")} <ChevronRight size={14}/>
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleFinish}
                  disabled={saving || testResult !== "ok"}
                >
                  {saving ? t("ui.common.loading", "Laden...") : t("ui.ai_wizard.finish", "Fertig")}
                </button>
              )}
            </div>
          </div>

          <Dialog.Close asChild>
            <button style={styles.close} onClick={handleSkip} aria-label="Close"><X size={16}/></button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Check whether the wizard should show. */
export function shouldShowAiWizard(appConfig: Record<string, unknown>): boolean {
  if (localStorage.getItem(DISMISSED_KEY)) return false
  const ai = (appConfig.ai || {}) as Record<string, unknown>
  return !ai.enabled
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.5)", zIndex: 9998,
  },
  content: {
    position: "fixed", top: "50%", left: "50%",
    transform: "translate(-50%, -50%)",
    background: "var(--bg-card)", borderRadius: "var(--radius-lg, 12px)",
    padding: 24, width: "min(480px, 90vw)",
    boxShadow: "var(--shadow-lg)", zIndex: 9999,
  },
  title: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: "1.125rem", fontWeight: 600, margin: 0, marginBottom: 16,
    color: "var(--text-primary)",
  },
  steps: {
    display: "flex", gap: 8, justifyContent: "center", marginBottom: 20,
  },
  stepDot: {
    width: 10, height: 10, borderRadius: "50%", transition: "background 0.2s",
  },
  stepContent: {
    minHeight: 120,
  },
  hint: {
    fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5,
  },
  providerGrid: {
    display: "flex", flexWrap: "wrap" as const, gap: 8,
  },
  providerBtn: {
    padding: "8px 16px", fontSize: "0.8125rem",
  },
  nav: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)",
  },
  close: {
    position: "absolute" as const, top: 12, right: 12,
    background: "none", border: "none", cursor: "pointer",
    color: "var(--text-muted)", padding: 4,
  },
}
