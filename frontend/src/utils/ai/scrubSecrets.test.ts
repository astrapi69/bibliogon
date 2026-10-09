/**
 * Red pins for #985: a backup must not carry a provider key.
 *
 * One case per shape the AI config has had, because a scrubber that knows
 * only the canonical one leaves the other two in the file - and the file
 * is what gets mailed around.
 */

import { describe, it, expect } from "vitest";

import { preserveLocalSecrets, scrubSecrets } from "./scrubSecrets";

describe("scrubSecrets", () => {
  it("empties the canonical per-provider key map (#460 shape)", () => {
    const { settings, removed } = scrubSecrets({
      ai: { active_provider: "google", keys: { google: "AIza-secret", anthropic: "sk-ant-secret" } },
    });
    const ai = (settings as { ai: Record<string, unknown> }).ai;
    expect(ai.keys).toEqual({});
    expect(ai.active_provider).toBe("google");
    expect(removed).toEqual(["ai.keys.anthropic", "ai.keys.google"]);
  });

  it("empties the derived top-level mirror", () => {
    const { settings, removed } = scrubSecrets({ ai: { provider: "google", api_key: "AIza-secret" } });
    const ai = (settings as { ai: Record<string, unknown> }).ai;
    expect(ai.api_key).toBe("");
    expect(ai.provider).toBe("google");
    expect(removed).toEqual(["ai.api_key"]);
  });

  it("empties the #459 provider_keys side-store but keeps its other fields", () => {
    const { settings, removed } = scrubSecrets({
      ai: {
        provider_keys: {
          google: { api_key: "AIza-secret", model: "gemini-2.0-flash" },
          custom: { api_key: "local", base_url: "http://localhost:11434/v1" },
        },
      },
    });
    const providerKeys = (settings as { ai: { provider_keys: Record<string, Record<string, unknown>> } }).ai
      .provider_keys;
    expect(providerKeys.google).toEqual({ api_key: "", model: "gemini-2.0-flash" });
    expect(providerKeys.custom).toEqual({ api_key: "", base_url: "http://localhost:11434/v1" });
    expect(removed).toEqual(["ai.provider_keys.custom.api_key", "ai.provider_keys.google.api_key"]);
  });

  it("keeps every non-secret AI setting, so a restore puts the user back", () => {
    const { settings } = scrubSecrets({
      ai: {
        active_provider: "custom",
        keys: { custom: "secret" },
        model_overrides: { custom: "llama-3.1" },
        base_url_overrides: { custom: "http://localhost:1234/v1" },
        enabled: true,
        temperature: 0.4,
        max_tokens: 2048,
      },
    });
    const ai = (settings as { ai: Record<string, unknown> }).ai;
    expect(ai).toMatchObject({
      active_provider: "custom",
      model_overrides: { custom: "llama-3.1" },
      base_url_overrides: { custom: "http://localhost:1234/v1" },
      enabled: true,
      temperature: 0.4,
      max_tokens: 2048,
    });
  });

  it("reports nothing when the fields exist but are empty", () => {
    const { removed } = scrubSecrets({ ai: { api_key: "", keys: {}, provider_keys: {} } });
    expect(removed).toEqual([]);
  });

  it("treats whitespace as empty rather than as a secret worth naming", () => {
    const { removed } = scrubSecrets({ ai: { api_key: "   ", keys: { google: "  " } } });
    expect(removed).toEqual([]);
  });

  it("leaves a settings blob without an ai section alone", () => {
    const input = { app: { default_language: "de" } };
    const { settings, removed } = scrubSecrets(input);
    expect(settings).toBe(input);
    expect(removed).toEqual([]);
  });

  it("survives a malformed settings response", () => {
    expect(scrubSecrets(undefined)).toEqual({ settings: undefined, removed: [] });
    expect(scrubSecrets("nope")).toEqual({ settings: "nope", removed: [] });
    expect(scrubSecrets({ ai: "nope" })).toEqual({ settings: { ai: "nope" }, removed: [] });
  });

  it("does not modify the input, so a caller can still read the live settings", () => {
    const input = { ai: { api_key: "AIza-secret", keys: { google: "g" } } };
    scrubSecrets(input);
    expect(input.ai.api_key).toBe("AIza-secret");
    expect(input.ai.keys).toEqual({ google: "g" });
  });

  it("keeps the field present rather than deleting it", () => {
    // A restore writes the settings back through the same schema the UI
    // reads. A missing key reads as "never configured"; an empty string
    // reads as "configured, then cleared", which is what happened.
    const { settings } = scrubSecrets({ ai: { api_key: "x", keys: { google: "g" } } });
    const ai = (settings as { ai: Record<string, unknown> }).ai;
    expect("api_key" in ai).toBe(true);
    expect("keys" in ai).toBe(true);
  });
});

describe("preserveLocalSecrets", () => {
  it("keeps a local key when the bundle's is empty (the #985 export)", () => {
    const merged = preserveLocalSecrets(
      { ai: { keys: { google: "AIza-live" }, api_key: "AIza-live" } },
      { ai: { keys: {}, api_key: "", active_provider: "google" } },
    ) as { ai: Record<string, unknown> };
    expect(merged.ai.keys).toEqual({ google: "AIza-live" });
    expect(merged.ai.api_key).toBe("AIza-live");
    expect(merged.ai.active_provider).toBe("google");
  });

  it("restores a real key from an older bundle taken before the scrubber", () => {
    const merged = preserveLocalSecrets(
      { ai: { keys: { google: "AIza-live" } } },
      { ai: { keys: { google: "AIza-from-backup", anthropic: "sk-ant-from-backup" } } },
    ) as { ai: { keys: Record<string, string> } };
    expect(merged.ai.keys).toEqual({
      google: "AIza-from-backup",
      anthropic: "sk-ant-from-backup",
    });
  });

  it("keeps a local provider the bundle does not mention", () => {
    const merged = preserveLocalSecrets(
      { ai: { keys: { mistral: "mi-live" } } },
      { ai: { keys: { google: "g-from-backup" } } },
    ) as { ai: { keys: Record<string, string> } };
    expect(merged.ai.keys).toEqual({ mistral: "mi-live", google: "g-from-backup" });
  });

  it("applies the same rule to the #459 side-store", () => {
    const merged = preserveLocalSecrets(
      { ai: { provider_keys: { google: { api_key: "live", model: "old" } } } },
      { ai: { provider_keys: { google: { api_key: "", model: "gemini-2.0-flash" } } } },
    ) as { ai: { provider_keys: Record<string, Record<string, unknown>> } };
    expect(merged.ai.provider_keys.google).toEqual({
      api_key: "live",
      model: "gemini-2.0-flash",
    });
  });

  it("overwrites every non-secret AI field, the way a restore is meant to", () => {
    const merged = preserveLocalSecrets(
      { ai: { active_provider: "mistral", temperature: 0.1, keys: { mistral: "m" } } },
      { ai: { active_provider: "google", temperature: 0.9, keys: {} } },
    ) as { ai: Record<string, unknown> };
    expect(merged.ai.active_provider).toBe("google");
    expect(merged.ai.temperature).toBe(0.9);
  });

  it("passes a bundle without an ai section straight through", () => {
    const restored = { app: { default_language: "fr" } };
    expect(preserveLocalSecrets({ ai: { keys: { google: "g" } } }, restored)).toBe(restored);
  });

  it("works when there are no live settings to preserve", () => {
    const merged = preserveLocalSecrets(undefined, { ai: { keys: {}, api_key: "" } }) as {
      ai: Record<string, unknown>;
    };
    expect(merged.ai.keys).toEqual({});
    expect(merged.ai.api_key).toBe("");
  });

  it("round-trips: scrub then restore leaves the live keys in place", () => {
    const live = { ai: { active_provider: "google", keys: { google: "AIza-live" } } };
    const { settings: bundled } = scrubSecrets(live);
    const merged = preserveLocalSecrets(live, bundled) as { ai: { keys: Record<string, string> } };
    expect(merged.ai.keys).toEqual({ google: "AIza-live" });
  });
});
