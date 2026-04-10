# Licenses

Premium plugins require HMAC-SHA256 signed license keys that are validated entirely offline. Enter your key in Settings > Licenses with the plugin name (e.g., "audiobook"). Keys are stored locally in `config/licenses.json`.

Trial keys valid for 30 days across all premium plugins can be generated with `make generate-trial-key`. The key format is `BIBLIOGON-{PLUGIN}-v{N}-{base64 payload}.{base64 signature}`. Validation checks the plugin-specific key first, then falls back to a wildcard (`*`) trial key.
