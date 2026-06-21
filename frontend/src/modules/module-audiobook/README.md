# module-audiobook

Frontend counterpart of **`bibliogon-plugin-audiobook`**.

- **Offline status:** Not possible (cloud/desktop-only).
- **Reason:** audiobook generation delegates to the `manuscripta` TTS adapter
  (Edge / Google / ElevenLabs / pyttsx3); every engine is a server-side or cloud
  synthesis path with no browser equivalent. The async SSE job + persistence
  also require the backend.
- **Implemented:** nothing browser-side. The module exists to keep the
  plugin-parity map complete and to host the gate rationale.
- **Gating:** `FEATURES.TTS` → `disabled` in Dexie mode (reason
  `requires_desktop_app`). The surface stays visible and explained (policy #78).
