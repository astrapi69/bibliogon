# OpenAI works browser-direct — the Bibliogon "OpenAI is CORS-blocked" assumption is WRONG

> **Verdict (analysis 2026-06-19):** OpenAI **and** Mistral are reachable
> browser-direct from a GitHub-Pages PWA. Bibliogon's gating of them as
> desktop-only / not-browser-testable (introduced in #450, the
> `BROWSER_TESTABLE_PROVIDERS` exclusion in `frontend/src/ai/llmClient.ts`) was
> **incorrect** and is removed in #467. The earlier "OpenAI 403 = CORS wall"
> reading was wrong — the 403 was a key/account/region-specific provider
> response, not a universal browser block.

## The question

- adaptive-learner: OpenAI tests **"Verbindung ok"** in the browser
  (`astrapi69.github.io/adaptive-learner` **is** the PWA on GH Pages, no backend).
- Bibliogon PWA: OpenAI returned **403** and was assumed CORS-blocked.
- Both run in the browser. Why does it work in AL?

## Empirical CORS evidence (live `curl`, 2026-06-19)

### OpenAI

`GET https://api.openai.com/v1/models` with an `Origin` header:

```
HTTP/2 401
access-control-allow-origin: *          ← browser may read it
```

`OPTIONS` preflight for `POST https://api.openai.com/v1/chat/completions`:

```
HTTP/2 200
access-control-allow-origin: https://example.com
access-control-allow-methods: GET, OPTIONS, POST   ← POST is allowed cross-origin
access-control-allow-headers: authorization,content-type
access-control-max-age: 86400
```

`POST .../v1/chat/completions` with a **bad** key:

```
HTTP/2 401          ← reached OpenAI and was processed (not a 403 browser-wall)
(no access-control-allow-origin on this ERROR response — see caveat below)
```

### Mistral

```
GET https://api.mistral.ai/v1/models        → 401, access-control-allow-origin: *
OPTIONS .../v1/chat/completions (preflight)  → 200, access-control-allow-origin: *,
                                               access-control-allow-methods: …,POST,…
```

### Anthropic / Gemini (already known)

Anthropic: browser-direct via the `anthropic-dangerous-direct-browser-access: true`
header. Gemini: OpenAI-compat endpoint serves `ACAO: *`. Both already
browser-capable in Bibliogon.

## The decisive proof: AL *generates* browser-direct with OpenAI

adaptive-learner does the **actual generation** browser-direct.
`adaptive-learner/frontend/src/storage/ai-providers.ts` (lines 204 non-streaming,
465 streaming) calls
`fetch("https://api.openai.com/v1/chat/completions", { … })` from its Dexie/PWA
session flow. AL ships with `CORS_BLOCKED_PROVIDERS = new Set()` (empty) — it
treats **all** providers as browser-capable, and it works in production. That is
ground truth: **OpenAI `chat/completions` is usable browser-direct from a
GH-Pages origin with a valid key.**

## So why did Bibliogon see 403 / "Failed to fetch"?

Two separate things, neither a universal CORS wall:

1. **The user's 403** was a real OpenAI authorization response for *that* key /
   project / region (OpenAI returns 403 e.g. for an unsupported region or a
   project lacking model access). A different (bad) key got **401**, not 403 —
   confirming 403 is account-specific, not a blanket browser block. A 403 the UI
   could *classify* means the browser *could* read it → CORS was not blocking.

2. **Bad-key error responses on `chat/completions` omit
   `access-control-allow-origin`.** The preflight passes and a **200 success
   carries ACAO** (that's why AL works), but the **401/4xx error body from
   `chat/completions` has no ACAO**. In a browser a *wrong* OpenAI key surfaces
   as a transport/CORS error ("Failed to fetch" → classified `cors`) rather than
   a clean "key invalid". That is a **messaging quirk on the error path**, NOT a
   reason the provider is unusable. (AL sidesteps it by testing via
   `GET /v1/models`, which always carries `ACAO: *` — Bibliogon's per-row test
   already does the same.)

## Corrected conclusion

| Provider | Generation (`POST /chat/completions`) | Test (`GET /v1/models`) | Verdict |
|---|---|---|---|
| Gemini | ✅ (`ACAO: *`) | ✅ | browser-capable (already) |
| Anthropic | ✅ (opt-in header) | ✅ | browser-capable (already) |
| **OpenAI** | ✅ (preflight allows POST; 200 carries ACAO) | ✅ (`ACAO: *`) | **browser-capable — was wrongly gated** |
| **Mistral** | ✅ (preflight allows POST; `ACAO: *`) | ✅ (`ACAO: *`) | **browser-capable — was wrongly gated** |
| LM Studio / custom | ✅ (user-controlled) | ✅ | browser-capable (already) |

**Every shipped provider is browser-capable.** The `desktop_only` / CORS-blocked
distinction has no real members for the current provider set — exactly like
adaptive-learner's empty `CORS_BLOCKED_PROVIDERS`.

## What changed in Bibliogon (#467)

1. **`frontend/src/ai/llmClient.ts`** — mirror AL: the allowlist
   `BROWSER_TESTABLE_PROVIDERS` is replaced by an explicit **empty**
   `CORS_BLOCKED_PROVIDERS` set, so `providerSupportsBrowserTest()` returns `true`
   for every provider.
2. **`frontend/src/features/featureConfig.ts`** — with all providers
   browser-capable, `aiProviderBrowserCapable` is always `true`, so the
   `PROVIDER_CORS_BLOCKED` branch no longer fires for any real provider and
   OpenAI/Mistral AI features are **active** in Dexie mode like Gemini/Anthropic.
   The `requires_ai_key` gate stays (no key → disabled). The mechanism stays as
   dormant defensive infra (empty set), matching AL.
3. **Connection test** — the per-row test already uses `listModels` →
   `GET /v1/models` (carries `ACAO: *` for OpenAI/Mistral), so a bad key
   classifies as `auth_error` (401) correctly. Unchanged.
4. **Generation error messaging** — a *wrong* OpenAI key on `chat/completions`
   can still surface as `cors` because the 401 error body lacks ACAO. Cosmetic,
   provider-side; not a reason to gate. Left as-is.
5. **Docs/comments corrected** — the `llmClient.ts` header, `useAiModels` and
   `module-ai` comments no longer claim OpenAI/Mistral are CORS-blocked.

## Why the earlier sessions got it wrong

#450's table came from the original feature prompt's CORS table (which listed
OpenAI as CORS-blocked). Anthropic was already corrected (it works via the opt-in
header). OpenAI/Mistral were left gated on the strength of the user's 403 console
line — but that 403 was account/region-specific, and the assumption was never
verified against the actual CORS headers or a working reference. AL's GH-Pages
PWA + the `curl` preflight are the verification that was missing. This is the
"verify the assumption against real data / a running reference before gating"
lesson, applied to a provider-capability claim.

---

*Empirical `curl` probes run 2026-06-19; AL generation path quoted verbatim from
`adaptive-learner/frontend/src/storage/ai-providers.ts`. Implemented in #467.*
