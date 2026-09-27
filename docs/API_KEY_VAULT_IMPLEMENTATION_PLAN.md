# API Key Vault Implementation Plan

## Overview
Add encrypted export/import of AI API keys to Bibliogon Settings (Data tab), modeled after adaptive-learner's `KeyVaultSection` from `@astrapi69/ai-key-vault-react`.

## Current State in Bibliogon
- AI keys stored per-provider in `settings.ai.keys` (OpenAI, Anthropic, Google/Gemini, Mistral, LMStudio)
- Separate ElevenLabs key for audiobook (plugin-audiobook)
- DeepL key for translation (plugin-translation)
- LanguageTool key for grammar (plugin-grammar)
- Keys saved via backend PATCH `/api/settings` (stripped when externally managed via secrets.yaml/env)
- No encrypted export/import capability

## Adaptive-Learner Reference Implementation
Located in `/home/astrapi69/dev/git/hub/astrapi69/ai-key-vault`:
- `@astrapi69/ai-key-vault` (core crypto: `buildEncryptedKeyVault`, `importEncryptedKeyVault`, `hasExportableKey`)
- `@astrapi69/ai-key-vault-react` (React components: `KeyVaultSection`, `KeyVaultImportForm`, `SecretInput`)
- File format: `.alk` (Adaptive Learner Key) - passphrase-encrypted JSON envelope

## Implementation Plan

### Phase 1: Add Dependencies
- [ ] Add `@astrapi69/ai-key-vault` and `@astrapi69/ai-key-vault-react` to `frontend/package.json`
- [ ] Update `pnpm-lock.yaml` / run `pnpm install`

### Phase 2: Backend Support
- [ ] Add `/api/ai/keys/export` endpoint (POST with passphrase, returns encrypted envelope)
- [ ] Add `/api/ai/keys/import` endpoint (POST with encrypted envelope + passphrase)
- [ ] Endpoint should:
  - Validate passphrase
  - Decrypt envelope using core library logic
  - Store keys per-provider in settings
  - Return import result (which providers got keys)
  - Strip keys when externally managed (secrets.yaml / BIBLIOGON_AI_API_KEY)
- [ ] Add i18n keys for success/error messages

### Phase 3: Frontend Integration
- [ ] Create `KeyVaultSection` wrapper component in `frontend/src/components/settings/ai/KeyVaultSection.tsx`
  - Adapts `@astrapi69/ai-key-vault-react` KeyVaultSection to Bibliogon's context
  - Uses Bibliogon's `useI18n`, `notify`, `Button`, `api` client
  - Maps Bibliogon providers to ai-key-vault provider IDs
- [ ] Add to Settings Data tab (alongside Backup, SelectiveExport, ExportSection)
- [ ] Handle "secrets managed externally" case (show notice, allow import only)
- [ ] Add i18n keys for all UI strings (DE, EN, ES, FR, EL, PT, TR, JA)

### Phase 4: Provider Mapping
Bibliogon providers → ai-key-vault IDs:
| Bibliogon | ai-key-vault ID | Notes |
|-----------|----------------|-------|
| openai | openai | |
| anthropic | anthropic | |
| google | gemini | |
| mistral | mistral | |
| lmstudio | lmstudio | No key required |
| deepl | deepl | plugin-translation |
| languagetool | languagetool | plugin-grammar |
| elevenlabs | elevenlabs | plugin-audiobook |

### Phase 5: Testing
- [ ] Unit tests for export/import endpoints
- [ ] Integration test: export → import round-trip
- [ ] E2E test: UI flow in Settings → Data tab
- [ ] Test cross-app compatibility (import adaptive-learner .alk file)

### Phase 6: Documentation
- [ ] Update settings help docs
- [ ] Add to CHANGELOG

## Files to Create/Modify

### New Files
1. `backend/app/routers/ai_keys.py` - Export/import endpoints
2. `backend/app/services/key_vault.py` - Core crypto operations (wrapper around ai-key-vault)
3. `frontend/src/components/settings/ai/KeyVaultSection.tsx` - Wrapper component
4. `frontend/src/components/settings/ai/AiKeyVaultProvider.tsx` - Context provider (like adaptive-learner)

### Modified Files
1. `frontend/package.json` - Add dependencies
2. `frontend/src/pages/system/settings/tabs/DataPanel.tsx` - Add KeyVaultSection
3. `backend/config/i18n/*.yaml` - Add i18n keys
4. `frontend/src/api/client.ts` - Add ai.keys export/import methods

## Security Considerations
- Passphrase never stored, only used for encryption/decryption
- Keys encrypted with AES-GCM (via Web Crypto API / Node crypto)
- Envelope format includes: format version, salt, IV, ciphertext, auth tag
- Import validates format before decrypting
- Wrong passphrase → clear error, no key leakage

## Migration Path
- Existing keys in settings remain untouched
- New export creates `.bgk` (Bibliogon Keys) or `.alk` file
- Import merges keys (per-provider overwrite)
- Works in both online (API mode) and offline (Dexie) modes

## Timeline Estimate
- Phase 1-2: 2-3 days (backend + deps)
- Phase 3-4: 3-4 days (frontend integration + provider mapping)
- Phase 5: 1-2 days (testing)
- Phase 6: 0.5 days (docs)
- **Total: ~1-2 weeks**
