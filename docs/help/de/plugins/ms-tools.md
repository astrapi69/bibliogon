# Manuskript-Tools

Das Manuskript-Tools-Plugin unterstützt dich beim Überarbeiten deines Textes. Es prüft Stil, bereinigt Formatierungs-Reste und misst Lesbarkeit. Ziel ist nicht, dir vorzuschreiben wie du schreiben sollst, sondern dir Auffälligkeiten zu zeigen die du übersehen hast.

Das Plugin läuft komplett lokal. Keine Texte werden an externe Dienste gesendet.

---

## Stil-Checks

Die Stil-Checks finden Muster die den Lesefluss stören oder Texte schwammig wirken lassen. Jeder Treffer ist ein Hinweis, keine Vorschrift. Ein bewusst eingesetztes Füllwort kann genau das richtige sein.

### Füllwörter

Füllwörter sind Ausdrücke die im Satz nichts beitragen und meist gestrichen werden können, ohne dass sich die Bedeutung ändert. Das Plugin markiert typische Kandidaten wie "eigentlich", "quasi", "im Grunde", "sozusagen", "praktisch", "irgendwie", "wirklich", "halt", "eben", "also", "ja".

Beispiel:
- Vorher: "Ich wollte eigentlich nur sagen, dass das irgendwie seltsam ist."
- Nachher: "Ich wollte sagen, dass das seltsam ist."

Die Liste ist sprachspezifisch. Für Deutsch, Englisch, Spanisch, Französisch und weitere Sprachen gibt es eigene Kataloge.

### Passivkonstruktionen

Passiv macht Sätze länger und nimmt dem Subjekt die Handlung. Aktiv-Sätze sind meist direkter und lebendiger. Das Plugin markiert Passiv-Formen wie "wurde gemacht", "ist worden", "werden gesehen".

Beispiel:
- Passiv: "Die Tür wurde von ihm geöffnet."
- Aktiv: "Er öffnete die Tür."

Ausnahmen: In wissenschaftlichen Texten, Gerichtsurteilen oder wenn das Subjekt unbekannt oder unwichtig ist, bleibt Passiv die richtige Wahl. Das Plugin markiert nur, es entscheidet nicht.

### Lange Sätze

Sätze über 25 Wörter sind schwerer zu erfassen. Das Plugin markiert Sätze die diesen Schwellwert überschreiten und schlägt Trennpunkte vor (meist Kommas oder Konjunktionen wo der Satz natürlich geteilt werden kann).

Der Schwellwert ist konfigurierbar. Für Sachbücher sind 20 Wörter typisch, für literarische Texte darf es mehr sein. In den Plugin-Einstellungen kannst du den Wert pro Buch anpassen.

### Wortwiederholungen

Nah aufeinander folgende Wiederholungen des gleichen Wortes wirken ungeschickt. Das Plugin markiert Wörter die innerhalb eines einstellbaren Fensters (Default: 50 Wörter) zweimal oder oefter auftauchen.

Häufige Ausnahmen wie "der", "die", "das", "und", "ist" werden automatisch ignoriert. Die Stoppwort-Liste ist pro Sprache vorkonfiguriert.

### Adverbien auf -ly / -lich

Zu viele Adverbien sind oft ein Zeichen für schwache Verben. "Er rannte schnell" kann oft durch ein präziseres Verb ersetzt werden: "Er sprintete". Das Plugin markiert Adverbien die auf typische Endungen enden und zeigt die Dichte pro Absatz.

### Redundante Phrasen

Ausdrücke die sich selbst wiederholen oder Information doppelt liefern. Beispiele: "rund und kreisförmig", "komplett fertig", "persönliche Meinung", "zukünftige Pläne", "kurze Zusammenfassung".

Die Liste ist klein und konservativ gehalten um Fehlalarme zu vermeiden.

---

## Text-Sanitization

Wenn du Inhalte aus Word, Google Docs, Browsern oder PDFs übernimmst, schleppst du oft unsichtbaren Datenmüll mit: geschützte Leerzeichen, Unicode-Varianten von Zeichen, leere Absätze, doppelte Leerzeichen. Das fällt beim Lesen nicht auf, macht aber im Export (besonders EPUB und Audiobook) Probleme.

Die Sanitization bereinigt typische Fehlerquellen auf Knopfdruck. Du kannst sie manuell auslösen oder automatisch beim Import aktivieren.

### Was bereinigt wird

**Unsichtbare Zeichen:**
- Geschützte Leerzeichen (U+00A0) werden zu normalen Leerzeichen
- Zero-Width Spaces (U+200B) werden entfernt
- Byte Order Marks (U+FEFF) werden entfernt
- Soft Hyphens (U+00AD) werden entfernt

**Typografische Zeichen:**
- "Gerade" Anführungszeichen werden zu typografischen wenn der Buchtyp es erfordert
- Doppelte Bindestriche (--) werden zu Gedankenstrichen, abhängig von der Einstellung
- Ellipsen aus drei Punkten (...) werden zu einem echten Ellipsen-Zeichen (U+2026)

**Whitespace:**
- Mehrfache Leerzeichen werden zu einem Leerzeichen
- Trailing Whitespace am Zeilenende wird entfernt
- Mehr als zwei aufeinanderfolgende Leerzeilen werden zu zwei

**HTML- und Word-Reste:**
- Leere HTML-Tags aus Copy-Paste werden entfernt
- Style-Attribute aus externen Quellen werden entfernt
- Word-spezifische Kommentare und Metadaten werden entfernt

### Was NICHT bereinigt wird

- Bewusst gesetzte Formatierung (fett, kursiv, Überschriften)
- Absichtliche Formatierungen wie Zitate oder Code-Blöcke
- Manuelle Zeilenumbrüche in Gedichten oder Dialogen

Wenn du dir unsicher bist, aktiviere zuerst die Vorschau-Funktion die zeigt was geändert würde, bevor du die Änderungen übernimmst.

### Sanitization beim Import

In den Plugin-Einstellungen kannst du aktivieren dass die Sanitization automatisch beim Import eines Buches oder Kapitels läuft. Das ist empfehlenswert für Importe aus Word oder write-book-template.

---

## Textmetriken

Metriken sagen dir objektiv wie dein Text strukturiert ist. Sie ersetzen kein gutes Lektorat, helfen aber bei der Selbstüberpruefung und beim Vergleich verschiedener Kapitel.

### Wortzahl und Zeichenzahl

Die Basis. Pro Kapitel, pro Sektion und für das gesamte Buch.

- Wörter (ohne Interpunktion)
- Zeichen mit Leerzeichen
- Zeichen ohne Leerzeichen
- Absätze
- Sätze
- Geschätzte Druckseiten (250 Wörter = 1 Seite, konfigurierbar)

### Lesbarkeitsindex (Flesch-Kincaid)

Der Flesch-Wert misst wie leicht ein Text zu lesen ist. Höhere Werte bedeuten einfacher zu lesen.

Skala für Deutsch:

| Wert | Schwierigkeit | Beispiel |
|------|---------------|----------|
| 0-30 | Sehr schwer | Wissenschaftliche Fachliteratur |
| 30-50 | Schwer | Fachbücher, gehobene Literatur |
| 50-60 | Mittelschwer | Zeitungen, Sachbücher |
| 60-70 | Mittel | Romane, allgemeine Belletristik |
| 70-80 | Leicht | Jugendbücher, einfache Sachtexte |
| 80-100 | Sehr leicht | Kinderbücher |

Für andere Sprachen nutzt das Plugin sprachspezifische Varianten: Englisch (Flesch Reading Ease), Spanisch (Fernandez-Huerta), Französisch (Kandel-Moles).

### Durchschnittliche Satzlänge

Kurze Sätze (unter 10 Wörter) wirken abgehackt, lange Sätze (über 25 Wörter) anstrengend. Ausreißer nach oben oder unten sind ein Signal.

### Durchschnittliche Wortlänge

Lange Wörter (mehr als 7 Zeichen) sind oft Fachbegriffe oder Substantivierungen. Für Belletristik sind 4-5 Zeichen typisch, für Wissenschaft eher 6-7.

### Adjektivdichte und Adverbdichte

> Adjektivdichte ist geplant für eine kommende Version (benötigt POS-Tagging). Adverbdichte ist bereits verfügbar über die Adverb-Erkennung in den Stil-Checks.

Anteil von Adjektiven und Adverbien am Gesamttext. Über 15% ist ein Warnsignal. Guter Erzählstil trägt die Handlung mit Verben, nicht mit Beschreibungen.

### Lesezeit

Geschätzte Lesezeit basierend auf Wortzahl und durchschnittlicher Lesegeschwindigkeit (Default: 200 Wörter pro Minute, konfigurierbar). Anzeige pro Kapitel und für das gesamte Buch.

### Füllwort-Quote

Wieviel Prozent deines Textes besteht aus Füllwörtern? Werte über 5% sind ein Signal zum Überarbeiten. Literarische Texte liegen oft unter 2%.

### Passiv-Quote

Anteil der Passiv-Sätze am Text. Für Belletristik sind 5-10% typisch, für Sachbücher 10-20%.

---

## Konfiguration

Die Schwellwerte existieren auf zwei Ebenen:

**Plugin-global** unter `Einstellungen > Plugins > Manuskript-Tools` (Defaults für alle Bücher):

- **Satzlänge-Schwellwert**: Ab wieviel Wörtern ein Satz als lang markiert wird. Default: 25.
- **Auto-Sanitization beim Import**: Boolean, Default an. Säubert Markdown-Importe von unsichtbaren Unicode-Zeichen, HTML-Artefakten und typografischen Anführungszeichen.

**Pro Buch** im BookEditor > Metadaten (überschreibt die globalen Defaults für dieses Buch):

- **Satzlänge-Schwellwert** (`ms_tools_max_sentence_length`)
- **Wiederholungs-Fenster** (`ms_tools_repetition_window`)
- **Max. Füllwort-Anteil** (`ms_tools_max_filler_ratio`)

Auflösungs-Reihenfolge: Request > Buch > Plugin-global > Built-in-Default.

Die **Füllwort-Listen** und die **Allowlist** (Begriffe von der Prüfung ausgenommen) liegen als YAML-Dateien im Plugin-Paket unter `content/fillers/{lang}.yaml` und `content/allowlist/{lang}.yaml`. Sie können direkt dort editiert werden und werden beim App-Start geladen.

---

## Häufige Fragen

**Warum markiert das Plugin ein Wort das ich bewusst einsetze?**
Die Stil-Checks kennen deinen Kontext nicht. Ignorier den Treffer wenn er nicht passt. Du kannst einzelne Begriffe in den Plugin-Einstellungen von der Prüfung ausnehmen.

**Werden meine Texte an einen Server gesendet?**
Nein. Das komplette Plugin läuft lokal. Keine Cloud-Komponente, keine Telemetrie.

**Kann ich die Stil-Checks auch auf englische Texte anwenden?**
Ja. Die Listen und Regeln sind pro Sprache definiert. Das Plugin erkennt die Sprache automatisch aus den Buch-Metadaten.

**Kann ich die Metriken exportieren?**
Ja. Im Qualitäts-Tab der Buch-Metadaten gibt es einen "Exportieren" Button der alle Metriken als CSV oder JSON herunterlädt.
