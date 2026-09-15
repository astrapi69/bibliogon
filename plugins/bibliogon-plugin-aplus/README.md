# A+ Content plugin

Generates an Amazon A+ Content package (short description, bullets, header
module, three-image module, image prompts) from a book already in Bibliogon.
Design and pre-audit findings: see issue #825.

## Validation

Text-quality rules are deterministic and independent of the AI provider,
defined per language in `bibliogon_aplus/rules/ruleset.yaml`. Genre-specific
severity escalation (e.g. Kinderbuch) lives in the same file.

## Tests

```bash
make test-plugin-aplus
```
