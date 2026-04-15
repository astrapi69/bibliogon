# Troubleshooting

## Export fails with "Pandoc not found"

If a PDF, DOCX, or HTML export aborts with "Pandoc not found", Pandoc is not installed on the system or not on the PATH.

**Fix:**

1. Check whether Pandoc is installed: `pandoc --version`
2. If not installed:
   - Linux (Debian/Ubuntu): `sudo apt install pandoc`
   - macOS: `brew install pandoc`
   - Windows: installer from [pandoc.org](https://pandoc.org/installing.html)
3. For PDF export, also install a LaTeX distribution (e.g. `sudo apt install texlive-full`).
4. Restart the backend after installing.

If you are running Bibliogon via Docker (`make prod`), Pandoc and LaTeX are already inside the container; in that case the cause is more likely a configuration issue.

EPUB export works without Pandoc because manuscripta ships its own EPUB generator.

## Voices do not load

If the voice dropdown in the audiobook section stays empty or shows "No voices available", a few causes are possible:

- **Edge TTS**: needs an internet connection. Voices are loaded into the voice cache on application start. Restart the application if voices do not appear.
- **ElevenLabs**: check that the API key is configured under Settings > Audiobook. The key is validated against the ElevenLabs API on save.
- **Google Cloud TTS**: make sure the API credentials are configured correctly.
- **pyttsx3**: the available voices depend on the operating system. On Linux you need `espeak` or `espeak-ng` installed.
- **Wrong language**: some engines only offer voices for specific languages. Make sure the chosen book language is supported by the engine.

## Images missing in export

If images are visible in the editor but missing from the exported EPUB or PDF:

- Make sure the images are stored as book assets, not just as external URLs.
- Check the book metadata that the cover image is set correctly.
- For EPUB: open the EPUB file with a ZIP tool and verify that the images are present in the `assets/` folder.
- For imported write-book-template projects: image paths are rewritten automatically. If images are missing, check that they were present in the source project's `assets/figures/` folder.
- **For books imported from external sources (write-book-template, EPUB, DOCX) that were exported on a version older than v0.15.0:** PDF and DOCX exports could silently drop image figures. v0.15.0 fixes this. Re-export to verify your output now contains all expected images.

## Backend does not start

If `make dev` or `make prod` does not start:

- Check that all dependencies are installed: `make install`
- Check that port 8000 (backend) and port 5173 (frontend) are free.
- Check the log output for errors. Common causes: missing Python packages, broken plugin configuration, or a corrupt SQLite file.
- In Docker mode: check container output with `docker compose logs`.
