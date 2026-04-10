# Troubleshooting

**Export fails with "Pandoc not found":** Pandoc must be installed separately for PDF, DOCX, and HTML export. Install it via your package manager (`apt install pandoc`, `brew install pandoc`) or download from pandoc.org. For PDF export, a LaTeX distribution is also required. Docker deployments include Pandoc pre-installed. EPUB export works without Pandoc.

**Voices not loading in Audiobook:** Check your internet connection (Edge TTS), API key configuration (ElevenLabs via Settings > Audiobook), or system speech packages (pyttsx3 requires espeak on Linux). Restart the application to refresh the voice cache.

**Plugin not activating:** Navigate to Settings > Licenses and verify the plugin name matches exactly (lowercase, e.g., "audiobook"). Check the error message for details: expired key, invalid signature, or mismatched plugin name. Generate a trial key with `make generate-trial-key` for testing.
