"""Rough token and cost estimates for the AI review UI.

MVP uses a character-count heuristic (~4 chars per token) for the
input and a conservative output allowance. Precise counting with
`tiktoken` / provider-native counters is post-MVP. See
docs/explorations/ai-review-extension.md 3.13.

The pricing dict is a small hardcoded snapshot, updated when provider
prices change. Cost is reported in USD. When the provider or model is
unknown, `estimate_cost_usd` returns None and the UI hides the cost.
"""

from __future__ import annotations

# Per-million-token prices in USD for input and output tokens.
# Used for rough estimates on the review-start button. Update when
# a provider changes prices; last synced 2026-04-20.
PROVIDER_PRICING: dict[str, dict[str, float]] = {
    # Anthropic Claude
    "claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-5-20251001": {"input": 1.00, "output": 5.00},
    # OpenAI
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    # Google Gemini
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
    # Mistral
    "mistral-large-latest": {"input": 2.00, "output": 6.00},
    "mistral-medium-latest": {"input": 0.40, "output": 2.00},
    "mistral-small-latest": {"input": 0.20, "output": 0.60},
}

# Conservative default output size for a review. Used with the
# character heuristic for the "before you click" estimate. The real
# call uses max_tokens=2048 and usually returns less.
DEFAULT_REVIEW_OUTPUT_TOKENS = 1500


def estimate_tokens(text: str) -> int:
    """Rough token count via `chars / 4` heuristic.

    Overestimates by ~10-20% for Latin scripts which is the right side
    for a cost estimate shown to users.
    """
    if not text:
        return 0
    return max(1, len(text) // 4)


def estimate_cost_usd(
    model: str,
    input_tokens: int,
    output_tokens: int = DEFAULT_REVIEW_OUTPUT_TOKENS,
) -> float | None:
    """Estimate call cost in USD. Returns None if the model is unknown."""
    pricing = PROVIDER_PRICING.get(model)
    if pricing is None:
        return None
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 4)


def estimate_review_cost(
    model: str, content: str
) -> tuple[int, int, float | None]:
    """Return (input_tokens, output_tokens, cost_usd) for a review call.

    Input tokens approximate content + system-prompt overhead. System
    prompt adds ~300 tokens for the structured-output scaffolding plus
    focus/chapter-type/language/genre guidance.
    """
    input_tokens = estimate_tokens(content) + 300
    output_tokens = DEFAULT_REVIEW_OUTPUT_TOKENS
    cost = estimate_cost_usd(model, input_tokens, output_tokens)
    return input_tokens, output_tokens, cost
