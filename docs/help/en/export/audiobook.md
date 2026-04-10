# Audiobook Export

The Audiobook plugin (premium) generates MP3 files from book chapters using Text-to-Speech. Supported engines: Edge TTS (free, online), Google Cloud TTS (API key required), ElevenLabs (paid, high quality), and pyttsx3 (offline, lower quality). Generation runs asynchronously with real-time progress via Server-Sent Events.

A content-hash cache ensures that only modified chapters are re-generated, saving time and API costs. Output modes: merged (single file), separate (per chapter), or both. Generated files are persisted in `uploads/{book_id}/audiobook/` and remain available for download after the browser is closed.
