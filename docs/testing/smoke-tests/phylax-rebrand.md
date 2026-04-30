# Smoke Test: DONATE.md / DONATE-de.md Rebrand (Phylax → Bibliogon)

**Shipped:** 2026-04-30
**Commit:** 43895c7

DONATE.md and DONATE-de.md were copied from the Phylax project and never localized. 7 occurrences of "Phylax" in each + three Phylax-domain phrases that don't apply to a book authoring tool.

## Prerequisites

- Repo working tree clean.

## Flow 1 — No remaining Phylax refs in donation files

```bash
grep -n "Phylax\|phylax" DONATE.md DONATE-de.md
```

**Expected:** zero output.

## Flow 2 — No Phylax-domain copy survives

```bash
grep -in "health data\|gesundheitsdaten\|PWA distribution\|PWA-Distribution" DONATE.md DONATE-de.md
```

**Expected:** zero output. Replaced with:
- "your books, articles, and writing stay on your device"
- "Bücher, Artikel und Texte bleiben auf deinem Gerät"
- "code-signing certificates for desktop launcher distribution"
- "Code-Signing-Zertifikate für Desktop-Launcher-Distribution"

## Flow 3 — Repo-wide Phylax sweep

```bash
grep -rn "Phylax\|phylax" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist .
```

**Expected:** only historical references inside docs/explorations/ session journals (e.g. `donation-visibility-diagnosis.md` references the prior rebrand commit). Per project rule, historical changelog entries are exempt.

## Flow 4 — Donation channel URLs unchanged

Both files still link to the same `astrapi69` accounts:
- liberapay.com/astrapi69/donate
- github.com/sponsors/astrapi69
- ko-fi.com/astrapi69
- PayPal hosted button id `MJ7V43GU2H386`

```bash
grep -E "liberapay|github.com/sponsors|ko-fi|paypal" DONATE.md DONATE-de.md
```

**Expected:** at least 5 hits per file.

## Known issues / by-design

- DONATE.md / DONATE-de.md are landing pages, not the source-of-truth for in-app donation channels. The Settings UI reads from `backend/config/app.yaml` `donations.channels` (see [donation-visibility.md](./donation-visibility.md)).

## Failure modes

| Symptom | Likely cause |
|---------|---|
| `Phylax` reappears in DONATE files after a future merge | Someone reused the Phylax templates again. Re-run the sed in commit 43895c7 message. |
| Donation page references "health data" | Phylax-domain copy reverted. Check git log for the doc. |
