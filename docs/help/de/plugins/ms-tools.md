# Manuskript-Tools

Das Manuskript-Tools-Plugin unterstuetzt dich beim Überarbeiten deines Textes. Es prueft Stil, bereinigt Formatierungs-Reste und misst Lesbarkeit. Ziel ist nicht, dir vorzuschreiben wie du schreiben sollst, sondern dir Auffaelligkeiten zu zeigen die du übersehen hast.

Das Plugin laeuft komplett lokal. Keine Texte werden an externe Dienste gesendet.

---

## Stil-Checks

Die Stil-Checks finden Muster die den Lesefluss stören oder Texte schwammig wirken lassen. Jeder Treffer ist ein Hinweis, keine Vorschrift. Ein bewusst eingesetztes Füllwort kann genau das richtige sein.

### Füllwörter

Füllwörter sind Ausdruecke die im Satz nichts beitragen und meist gestrichen werden koennen, ohne dass sich die Bedeutung ändert. Das Plugin markiert typische Kandidaten wie "eigentlich", "quasi", "im Grunde", "sozusagen", "praktisch", "irgendwie", "wirklich", "halt", "eben", "also", "ja".

Beispiel:
- Vorher: "Ich wollte eigentlich nur sagen, dass das irgendwie seltsam ist."
- Nachher: "Ich wollte sagen, dass das seltsam ist."

Die Liste ist sprachspezifisch. Für Deutsch, Englisch, Spanisch, Franzoesisch und weitere Sprachen gibt es eigene Kataloge.

### Passivkonstruktionen

Passiv macht Saetze laenger und nimmt dem Subjekt die Handlung. Aktiv-Saetze sind meist direkter und lebendiger. Das Plugin markiert Passiv-Formen wie "wurde gemacht", "ist worden", "werden gesehen".

Beispiel:
- Passiv: "Die Tuer wurde von ihm geöffnet."
- Aktiv: "Er öffnete die Tuer."

Ausnahmen: In wissenschaftlichen Texten, Gerichtsurteilen oder wenn das Subjekt unbekannt oder unwichtig ist, bleibt Passiv die richtige Wahl. Das Plugin markiert nur, es entscheidet nicht.

### Lange Saetze

Saetze über 25 Wörter sind schwerer zu erfassen. Das Plugin markiert Saetze die diesen Schwellwert überschreiten und schlaegt Trennpunkte vor (meist Kommas oder Konjunktionen wo der Satz natuerlich geteilt werden kann).

Der Schwellwert ist konfigurierbar. Für Sachbuecher sind 20 Wörter typisch, für literarische Texte darf es mehr sein. In den Plugin-Einstellungen kannst du den Wert pro Buch anpassen.

### Wortwiederholungen

Nah aufeinander folgende Wiederholungen des gleichen Wortes wirken ungeschickt. Das Plugin markiert Wörter die innerhalb eines einstellbaren Fensters (Default: 50 Wörter) zweimal oder oefter auftauchen.

Häufige Ausnahmen wie "der", "die", "das", "und", "ist" werden automatisch ignoriert. Die Stoppwort-Liste ist pro Sprache vorkonfiguriert.

### Adverbien auf -ly / -lich

Zu viele Adverbien sind oft ein Zeichen für schwache Verben. "Er rannte schnell" kann oft durch ein praeziseres Verb ersetzt werden: "Er sprintete". Das Plugin markiert Adverbien die auf typische Endungen enden und zeigt die Dichte pro Absatz.

### Redundante Phrasen

Ausdruecke die sich selbst wiederholen oder Information doppelt liefern. Beispiele: "rund und kreisfoermig", "komplett fertig", "persoenliche Meinung", "zukuenftige Plaene", "kurze Zusammenfassung".

Die Liste ist klein und konservativ gehalten um Fehlalarme zu vermeiden.

---

## Text-Sanitization

Wenn du Inhalte aus Word, Google Docs, Browsern oder PDFs übernimmst, schleppst du oft unsichtbaren Datenmuell mit: geschuetzte Leerzeichen, Unicode-Varianten von Zeichen, leere Absaetze, doppelte Leerzeichen. Das faellt beim Lesen nicht auf, macht aber im Export (besonders EPUB und Audiobook) Probleme.

Die Sanitization bereinigt typische Fehlerquellen auf Knopfdruck. Du kannst sie manuell ausloesen oder automatisch beim Import aktivieren.

### Was bereinigt wird

**Unsichtbare Zeichen:**
- Geschuetzte Leerzeichen (U+00A0) werden zu normalen Leerzeichen
- Zero-Width Spaces (U+200B) werden entfernt
- Byte Order Marks (U+FEFF) werden entfernt
- Soft Hyphens (U+00AD) werden entfernt

**Typografische Zeichen:**
- "Gerade" Anfuehrungszeichen werden zu typografischen wenn der Buchtyp es erfordert
- Doppelte Bindestriche (--) werden zu Gedankenstrichen, abhaengig von der Einstellung
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
- Absichtliche Formatierungen wie Zitate oder Code-Bloecke
- Manuelle Zeilenumbrueche in Gedichten oder Dialogen

Wenn du dir unsicher bist, aktiviere zuerst die Vorschau-Funktion die zeigt was geändert würde, bevor du die Änderungen übernimmst.

### Sanitization beim Import

> Geplant für eine kommende Version. Siehe ROADMAP.md

In den Plugin-Einstellungen kannst du aktivieren dass die Sanitization automatisch beim Import eines Buches oder Kapitels laeuft. Das ist empfehlenswert für Importe aus Word oder write-book-template.

---

## Textmetriken

Metriken sagen dir objektiv wie dein Text strukturiert ist. Sie ersetzen kein gutes Lektorat, helfen aber bei der Selbstüberpruefung und beim Vergleich verschiedener Kapitel.

### Wortzahl und Zeichenzahl

Die Basis. Pro Kapitel, pro Sektion und für das gesamte Buch.

- Wörter (ohne Interpunktion)
- Zeichen mit Leerzeichen
- Zeichen ohne Leerzeichen
- Absaetze
- Saetze
- Geschaetzte Druckseiten (250 Wörter = 1 Seite, konfigurierbar)

### Lesbarkeitsindex (Flesch-Kincaid)

Der Flesch-Wert misst wie leicht ein Text zu lesen ist. Hoehere Werte bedeuten einfacher zu lesen.

Skala für Deutsch:

| Wert | Schwierigkeit | Beispiel |
|------|---------------|----------|
| 0-30 | Sehr schwer | Wissenschaftliche Fachliteratur |
| 30-50 | Schwer | Fachbuecher, gehobene Literatur |
| 50-60 | Mittelschwer | Zeitungen, Sachbuecher |
| 60-70 | Mittel | Romane, allgemeine Belletristik |
| 70-80 | Leicht | Jugendbuecher, einfache Sachtexte |
| 80-100 | Sehr leicht | Kinderbuecher |

Für andere Sprachen nutzt das Plugin sprachspezifische Varianten: Englisch (Flesch Reading Ease), Spanisch (Fernandez-Huerta), Franzoesisch (Kandel-Moles).

### Durchschnittliche Satzlaenge

Kurze Saetze (unter 10 Wörter) wirken abgehackt, lange Saetze (über 25 Wörter) anstrengend. Ausreisser nach oben oder unten sind ein Signal.

### Durchschnittliche Wortlaenge

Lange Wörter (mehr als 7 Zeichen) sind oft Fachbegriffe oder Substantivierungen. Für Belletristik sind 4-5 Zeichen typisch, für Wissenschaft eher 6-7.

### Adjektivdichte und Adverbdichte

> Adjektivdichte ist geplant für eine kommende Version (benötigt POS-Tagging). Adverbdichte ist bereits verfügbar über die Adverb-Erkennung in den Stil-Checks.

Anteil von Adjektiven und Adverbien am Gesamttext. Über 15% ist ein Warnsignal. Guter Erzaehlstil traegt die Handlung mit Verben, nicht mit Beschreibungen.

### Lesezeit

Geschaetzte Lesezeit basierend auf Wortzahl und durchschnittlicher Lesegeschwindigkeit (Default: 200 Wörter pro Minute, konfigurierbar). Anzeige pro Kapitel und für das gesamte Buch.

### Füllwort-Quote

Wieviel Prozent deines Textes besteht aus Füllwörtern? Werte über 5% sind ein Signal zum Überarbeiten. Literarische Texte liegen oft unter 2%.

### Passiv-Quote

Anteil der Passiv-Saetze am Text. Für Belletristik sind 5-10% typisch, für Sachbuecher 10-20%.

---

## Konfiguration

Alle Einstellungen unter `Einstellungen > Plugins > Manuskript-Tools`:

- **Satzlaenge-Schwellwert**: Ab wieviel Wörtern ein Satz als lang markiert wird. Default: 25.
- **Wiederholungs-Fenster**: Innerhalb wieviel Wörtern eine Wiederholung erkannt wird. Default: 50.
- **Lesegeschwindigkeit**: Basis für die Lesezeit-Schaetzung. Default: 200 Wörter/Minute.
- **Füllwort-Liste**: Eigene Begriffe hinzufügen oder entfernen. Pro Sprache separat.
- **Auto-Sanitization beim Import**: An/Aus.
- **Aktive Checks**: Einzelne Stil-Checks deaktivieren falls du sie nicht brauchst.

Die Einstellungen werden pro Buch gespeichert.

---

## Häufige Fragen

**Warum markiert das Plugin ein Wort das ich bewusst einsetze?**
Die Stil-Checks kennen deinen Kontext nicht. Ignorier den Treffer wenn er nicht passt. Du kannst einzelne Begriffe in den Plugin-Einstellungen von der Prüfung ausnehmen.

**Werden meine Texte an einen Server gesendet?**
Nein. Das komplette Plugin laeuft lokal. Keine Cloud-Komponente, keine Telemetrie.

**Kann ich die Stil-Checks auch auf englische Texte anwenden?**
Ja. Die Listen und Regeln sind pro Sprache definiert. Das Plugin erkennt die Sprache automatisch aus den Buch-Metadaten.

**Kann ich die Metriken exportieren?**
Ja. Im Qualitaets-Tab der Buch-Metadaten gibt es einen "Exportieren" Button der alle Metriken als CSV oder JSON herunterlaedt.
