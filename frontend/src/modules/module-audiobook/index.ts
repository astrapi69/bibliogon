/**
 * module-audiobook — desktop-only counterpart of `plugin-audiobook`.
 *
 * NOT available offline (Maximal Offline, #34). Audiobook generation delegates
 * to the `manuscripta` TTS adapter (Edge / Google / ElevenLabs / pyttsx3); every
 * engine is a server-side or cloud synthesis path with no browser equivalent.
 * The surface is gated by feature-strategy (`FEATURES.TTS` → `disabled`, reason
 * `requires_desktop_app`): it stays visible and explained, never silently hidden.
 *
 * This module intentionally has no browser implementation; it exists so the
 * plugin-parity map is complete and the gate's rationale has a home.
 */
export const OFFLINE_AVAILABLE = false as const;
