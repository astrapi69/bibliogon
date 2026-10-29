# Board: Status und offene Aufgaben außerhalb des Codes

**Stand: 2026-10-29** · Version auf `develop`: siehe `CLAUDE.md` · CI-Stand:
`gh run list --branch develop --limit 3`

Dieses Board ergänzt `docs/ROADMAP.md` und `docs/backlog.md`, es ersetzt sie
nicht. Die ROADMAP ordnet die **Entwicklungsarbeit** nach Priorität. Hier steht,
was **nur Aster** tun kann (Anträge, Downloads, Entscheidungen), was auf
**Externe** wartet und was gerade läuft. Jede Zeile zeigt auf ein Issue oder eine
Datei; Details stehen dort, nicht hier.

Pflege: Wer einen Punkt erledigt, setzt das Häkchen und verschiebt die Zeile
nach „Zuletzt erledigt“ (mit Datum). Einträge dort, die älter als 30 Tage sind,
fliegen raus - die Geschichte steht in den Issues und im CHANGELOG.

## Bei Aster

- [ ] **Zugang zur Amazon Ads API beantragen** - Schritt-für-Schritt-Plan:
      `docs/plans/amazon-ads-api-zugang.md` · Issue #1151
- [ ] **KDP-Berichte herunterladen und an Claude geben:** Royalty-Bericht
      (Verkäufe pro Titel) und KENP-Bericht, möglichst den ganzen verfügbaren
      Zeitraum. KDP hält Monatsberichte nur begrenzt vor. · Issue #1153
- [ ] **Einmalig lokal vor dem nächsten Pull von `develop`:** eine eigene
      `.claude/settings.json` in `.claude/settings.local.json` umbenennen, falls
      vorhanden (sonst verweigert git den Pull). · #1137

## Wartet auf Extern

- [ ] **Amazon:** Freigabe des Ads-API-Antrags (nach dem Antrag oben) · #1151

## In Arbeit

- (nichts)

## Offen, andere Lane

- [ ] **UI für den Finanz-Import** (Import per Drag-and-drop, Auswertung,
      Kosten, Kurse) - eigener CCW-Prompt. Muss den Finanz-Export im
      Danger-Zone-Dialog anbieten (#1131) und braucht einen Eintrag in der
      Feature-Registry (Desktop-only oder über den Storage-Seam). · #1129

## Zuletzt erledigt

- [x] 2026-10-29 · Regel: nur offizielle Schnittstellen · #1150
- [x] 2026-10-29 · KDP-Zahlungsbericht importieren, Amazon-Wechselkurse übernehmen · #1148
- [x] 2026-10-28 · Widersprüche in den Regel-Volltexten korrigiert · #1146
- [x] 2026-10-28 · Regeldateien gekürzt (Zusammenfassung + Volltext) · #1142, #1144
- [x] 2026-10-28 · `CLAUDE.md` auf 8000 Zeichen gekürzt · #1140
- [x] 2026-10-28 · Startup-Hook und `git add -A`-Sperre · #1138
- [x] 2026-10-27 · KDP-Berichte auch als XLSX · #1134
- [x] 2026-10-27 · Finanzdaten nicht im `.bgb`-Backup (entschieden) · #1133
- [x] 2026-10-27 · KDP-Report-Import und Deckungsbeitrag pro Titel · #1130
