# Word- und EPUB-Import

Bibliogon kann eine Word-Datei (`.docx`) oder ein EPUB (`.epub`) als
neues Buch importieren. Das ist der wichtigste Umstiegspfad aus Word,
Scrivener (über dessen DOCX-Export) und anderen Schreibprogrammen.

## Bedienung

1. Öffne den Import-Assistenten vom Dashboard.
2. Ziehe die `.docx`- oder `.epub`-Datei in Schritt 1 oder wähle sie
   über den Datei-Dialog.
3. Bibliogon konvertiert die Datei, zeigt im Preview-Panel die
   erkannten Kapitel und Bilder.
4. Passe bei Bedarf Titel, Autor und Sprache an und klicke auf
   **Importieren**.

## Kapitel-Aufteilung

Die Aufteilung in Kapitel erfolgt an den **Überschriften der Ebene 1**
(H1). Jede H1 wird zu einem eigenen Kapitel; der Text davor (Titelei)
wird verworfen. Hat das Dokument keine H1, landet der gesamte Text in
einem einzigen Kapitel.

Tipp: Formatiere im Ausgangsprogramm jede Kapitelüberschrift als
**Überschrift 1**, damit die Aufteilung sauber gelingt. Überschriften
tieferer Ebenen (H2, H3 …) bleiben innerhalb des Kapitels erhalten.

## Was übernommen wird

- Überschriften, Fett/Kursiv, Listen, Zitate
- Eingebettete Bilder (werden als Assets des Buches gespeichert)
- Die Dokumentstruktur, soweit sie sich nach Markdown übersetzen lässt

Die Konvertierung läuft über Pandoc. Sehr spezielle Word-Konstrukte
(komplexe Tabellen, Textfelder, Kommentare) können vereinfacht oder
ausgelassen werden.

## Voraussetzung

Der Word-/EPUB-Import benötigt das Programm **Pandoc** auf dem Server.
In der Docker-Installation ist es bereits enthalten. Fehlt Pandoc,
meldet der Import einen entsprechenden Fehler.
