# AI offline (your own API key)

In the web app (the backendless build at
[astrapi69.github.io/bibliogon](https://astrapi69.github.io/bibliogon/)),
the AI assistant talks to your AI provider **directly from the browser** using
your own API key. There is no Bibliogon server in the middle: your text and
your key go from your browser straight to the provider you chose, and nowhere
else.

This page covers the browser-direct setup. For the in-editor text suggestions,
chapter review and the desktop flow, see [AI Assistant](../ai.md); for the
template-fill workflows see [AI Templates](ai-templates.md).

## Configure your key

1. Open **Settings > AI Assistant** (the "KI" / AI tab).
2. Make sure **Enable AI features** is on.
3. Pick your **provider**. Choosing one fills in the default base URL and a
   sensible model; you can override both.
4. Enter your **API key** (not needed for LM Studio).
5. Click **Test connection**. The test call runs entirely in your browser
   against the provider — if it returns OK, you are ready.

Your key is stored **locally in your browser's IndexedDB** (the same storage
that holds your offline books). It is sent **only to the provider** when you
use an AI feature, never to any Bibliogon server.

## Supported providers

| Provider | API key | Browser-direct (CORS) |
|----------|---------|-----------------------|
| OpenAI (GPT) | Yes | Works |
| Google (Gemini) | Yes | Works |
| Anthropic (Claude) | Yes | Works (see header note below) |
| Mistral | Yes | May be blocked by CORS |
| LM Studio (local) | No | Always works |

### Anthropic header

Calling Anthropic directly from a browser requires the
`anthropic-dangerous-direct-browser-access` header. **Bibliogon sets this
automatically** — you do not need to do anything. Just pick Anthropic, enter
your key, and it works.

### CORS: why some providers may not respond in the browser

A browser-direct call is subject to the provider's CORS policy. OpenAI, Google
and a local LM Studio accept browser requests; some providers (or some
corporate networks) block cross-origin browser calls, which shows up as a
network/transport error on **Test connection** even though the key is correct.

If a cloud provider is blocked in your browser, the reliable offline path is
**LM Studio** (or any OpenAI-compatible local endpoint): it runs on your own
machine at `http://localhost:1234/v1`, needs no key, and never hits a CORS
boundary. Point the base URL at your local server and you have fully local,
fully offline AI.

## What works offline

- **Single-field generation** — the small AI button next to a field (the
  `AiGenerateButton`) generates SEO and marketing text for that one field
  (book description, back-cover text, author bio, keywords).
- **"Fill with AI"** — the template-fill that populates a whole set of
  **article or book metadata** fields at once, browser-direct against your
  provider.

Both run entirely client-side and fire **zero** Bibliogon `/api` requests.

## What does NOT work offline

- The **`.biblio.yaml` export / import round-trip** — the workflow where you
  export a template file, fill it in an external AI (e.g. a chat assistant) and
  re-import it — needs the desktop app. (The *in-app* "Fill with AI" above is
  the offline equivalent and covers the same metadata.)

See [Web app](../web-app.md) for the full list of what does and does not work
without the desktop app.
