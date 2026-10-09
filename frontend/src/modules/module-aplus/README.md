# module-aplus

Frontend offline counterpart of **`bibliogon-plugin-aplus`**.

- **Offline status:** Partial (validation yes; AI generation no).
- **Implemented:** the deterministic validator — every hard and soft rule
  of `bibliogon_aplus.validation`, in the same field order, against the
  seeded ruleset. No model call, no network, no database, so a package
  the user wrote or edited by hand is checked the same offline as on the
  desktop.
- **Backed by:** `src/lib/aplus/{ruleset,validation}.ts` (pure,
  library-grade). The ruleset arrives through
  `src/storage/seed/seed-aplus-ruleset.json`, generated from
  `plugins/bibliogon-plugin-aplus/bibliogon_aplus/rules/ruleset.yaml`
  because the ruleset has no API endpoint.
- **Parity evidence:** `src/lib/aplus/validation.parity.json` holds
  findings recorded from the real Python validator;
  `backend/tests/test_aplus_validator_parity.py` fails when Python stops
  producing them and `validation.parity.test.ts` fails when the port
  stops reproducing them.
- **Missing:** generating a package needs a model call, so `aplus-ai`
  stays gated with its reason (#891). Editing an A+ document already
  works offline through the storage seam (#887).
