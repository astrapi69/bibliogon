/**
 * AI provider presets for the Settings UI.
 *
 * Each preset defines the base_url, default_model, and whether
 * an API key is required. Model suggestions are hints - users
 * can enter any model string.
 */

export interface ProviderPreset {
  id: string
  label: string
  base_url: string
  default_model: string
  model_suggestions: string[]
  requires_api_key: boolean
}

export const AI_PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    base_url: 'https://api.anthropic.com/v1',
    default_model: 'claude-sonnet-4-20250514',
    model_suggestions: [
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-haiku-4-5-20251001',
    ],
    requires_api_key: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (GPT)',
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o',
    model_suggestions: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    requires_api_key: true,
  },
  google: {
    id: 'google',
    label: 'Google (Gemini)',
    base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    default_model: 'gemini-2.0-flash',
    model_suggestions: ['gemini-2.0-flash', 'gemini-1.5-pro'],
    requires_api_key: true,
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    base_url: 'https://api.mistral.ai/v1',
    default_model: 'mistral-large-latest',
    model_suggestions: [
      'mistral-large-latest',
      'mistral-medium-latest',
      'mistral-small-latest',
    ],
    requires_api_key: true,
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio (lokal)',
    base_url: 'http://localhost:1234/v1',
    default_model: '',
    model_suggestions: [],
    requires_api_key: false,
  },
}

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDER_PRESETS)

export function getProviderPreset(providerId: string): ProviderPreset | undefined {
  return AI_PROVIDER_PRESETS[providerId]
}
