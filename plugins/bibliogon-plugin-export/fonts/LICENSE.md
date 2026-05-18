# Picture-Book Fonts — License + Attribution

Five OFL-licensed font families bundled for the picture-book PDF
export pipeline (PB-PHASE4 Session 4c-B-1 Finding G3, 2026-05-19).

All fonts are licensed under the SIL Open Font License (OFL),
Version 1.1, which permits redistribution + bundling in
commercial software provided the OFL notice + original
copyright statements travel with the font.

Each subsection cites the upstream source + the canonical
copyright header. Full OFL text is available at:
http://scripts.sil.org/OFL

---

## Atkinson Hyperlegible

- File: `AtkinsonHyperlegible-Regular.ttf`
- Source: https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegible
- Copyright: 2020 Braille Institute of America, Inc.
- License: SIL OFL 1.1
- Notes: Designed by the Braille Institute for low-vision
  readability. Bibliogon's hardcoded picture-book default
  before Finding G shipped multi-font support (D11 backward-
  compat: continues to be the default when no fontFamily
  mark is present).

## Andika

- File: `Andika-Regular.ttf`
- Source: https://github.com/google/fonts/tree/main/ofl/andika
- Copyright: 2004–2022 SIL International
- License: SIL OFL 1.1
- Notes: SIL-designed for literacy contexts. Includes
  extensive multi-script Latin + extended-Latin coverage,
  hence the larger file size (~670 KB). The breadth of
  glyph coverage is desirable for international picture
  books.

## Comic Neue

- File: `ComicNeue-Regular.ttf`
- Source: https://github.com/google/fonts/tree/main/ofl/comicneue
- Upstream: https://github.com/crozynski/comicneue
- Copyright: 2014 The Comic Neue Project Authors
- License: SIL OFL 1.1
- Notes: Modernised Comic Sans alternative. Friendly,
  rounded letterforms appropriate for character-driven
  picture-book narration.

## Lexend

- File: `Lexend-VariableWeight.ttf`
- Source: https://github.com/google/fonts/tree/main/ofl/lexend
- Upstream: https://github.com/google/lexend
- Copyright: 2018-2022 Google LLC, Thomas Jockin, Bonnie
  Shaver-Troup
- License: SIL OFL 1.1
- Notes: Variable font with a `wght` axis (100-900).
  Designed for reading proficiency research; included
  here at default weight 400. Variable form preserved
  for future weight selectors without re-shipping
  the font.

## OpenDyslexic

- File: `OpenDyslexic-Regular.otf`
- Source: https://github.com/antijingoist/opendyslexic
- Copyright: Abelardo Gonzalez
- License: SIL OFL 1.1
- Notes: Designed for readers with dyslexia (weighted-
  bottom letterforms anchor each character). Optional
  per-page choice for dyslexia-friendly picture books.

---

## SIL Open Font License (OFL) 1.1 — full text

The complete OFL 1.1 text accompanies each font's original
source repository (linked above). The terms permit:

- Use, study, modification, redistribution (including in
  commercial software like Bibliogon's PDF export).
- Bundling with the application's own license (MIT in
  Bibliogon's case) without affecting the application's
  licensing.

The terms require:

- Original copyright + license notice travels with the
  fonts (this file).
- Modified versions must use a different name.
- Fonts cannot be sold standalone (selling Bibliogon
  with the fonts embedded is permitted).

No modifications to any of the 5 fonts above ship with
Bibliogon. The files are bit-for-bit copies of the
upstream releases listed in each subsection.
