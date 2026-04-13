import { describe, it, expect } from 'vitest'
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDER_IDS,
  getProviderPreset,
} from './aiProviders'

describe('AI Provider Presets', () => {
  it('has five providers', () => {
    expect(AI_PROVIDER_IDS).toHaveLength(5)
    expect(AI_PROVIDER_IDS).toEqual(['anthropic', 'openai', 'google', 'mistral', 'lmstudio'])
  })

  it('every provider ID has a matching preset', () => {
    for (const pid of AI_PROVIDER_IDS) {
      const preset = AI_PROVIDER_PRESETS[pid]
      expect(preset).toBeDefined()
      expect(preset.id).toBe(pid)
      expect(preset.label).toBeTruthy()
      expect(preset.base_url).toBeTruthy()
    }
  })

  it('getProviderPreset returns preset for known ID', () => {
    const preset = getProviderPreset('anthropic')
    expect(preset).toBeDefined()
    expect(preset!.id).toBe('anthropic')
    expect(preset!.base_url).toContain('anthropic.com')
  })

  it('getProviderPreset returns undefined for unknown ID', () => {
    expect(getProviderPreset('nonexistent')).toBeUndefined()
  })

  it('cloud providers require API key', () => {
    for (const pid of ['anthropic', 'openai', 'google', 'mistral']) {
      expect(AI_PROVIDER_PRESETS[pid].requires_api_key).toBe(true)
    }
  })

  it('lmstudio does not require API key', () => {
    expect(AI_PROVIDER_PRESETS.lmstudio.requires_api_key).toBe(false)
  })

  it('cloud providers have model suggestions', () => {
    for (const pid of ['anthropic', 'openai', 'google', 'mistral']) {
      expect(AI_PROVIDER_PRESETS[pid].model_suggestions.length).toBeGreaterThan(0)
    }
  })

  it('lmstudio has no model suggestions', () => {
    expect(AI_PROVIDER_PRESETS.lmstudio.model_suggestions).toEqual([])
  })

  it('lmstudio has empty default model', () => {
    expect(AI_PROVIDER_PRESETS.lmstudio.default_model).toBe('')
  })

  it('anthropic default model is a Claude model', () => {
    expect(AI_PROVIDER_PRESETS.anthropic.default_model).toContain('claude')
  })

  it('openai default model is gpt-4o', () => {
    expect(AI_PROVIDER_PRESETS.openai.default_model).toBe('gpt-4o')
  })

  it('google default model is gemini', () => {
    expect(AI_PROVIDER_PRESETS.google.default_model).toContain('gemini')
  })

  it('each provider has a unique base_url', () => {
    const urls = AI_PROVIDER_IDS.map((pid) => AI_PROVIDER_PRESETS[pid].base_url)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
