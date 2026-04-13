# Themes

Bibliogon bietet sechs Farbpaletten, jeweils in einer Hell- und einer Dunkel-Variante. Das Farbschema wird unter **Einstellungen > Anzeige** gewaehlt, die Hell/Dunkel-Umschaltung liegt auf dem Sonne/Mond-Icon in der Sidebar.

## Verfuegbare Paletten

### Warm Literary *(Standard)*
Warme Creme- und Braun-Toene mit Crimson Pro als Serifen-Schrift. Die Originalpalette von Bibliogon, angelehnt an klassisches Druckpapier.

### Cool Modern
Kuehle Blau-Grau-Toene mit Inter als serifenloser Schrift. Klares, modernes Layout fuer Autoren die einen nuechternen Look bevorzugen.

### Nord
Die beliebte Nord-Farbpalette in Bibliogon-Anpassung. Gedaempfte Pastelltoene, gut fuer lange Lesesitzungen.

### Klassisch *(neu)*
Papierhaftes Gefuehl mit warmen beige-creme Toenen und Bordeaux-Akzent. Serif-Schrift (Crimson Pro) in Editor, Sidebar und UI. Der Editor hat zusaetzlich eine Erst-Zeilen-Einrueckung auf allen Absaetzen ausser dem ersten nach einer Ueberschrift - typografische Konvention fuer literarische Texte.

**Wann waehlen:** Literarisches Schreiben, Roman, Belletristik. Fuer Autoren die von papier-aehnlichen Werkzeugen kommen.

### Studio *(neu)*
Dunkler, professioneller Look mit hohen Kontrasten und Mint/Teal-Akzent. Orientiert sich optisch an professionellen Audio- und Video-Schnitt-Programmen. Die Hell-Variante nutzt denselben Akzent auf hellem Grau. Inter fuer UI-Text, Source Serif Pro fuer Ueberschriften.

**Wann waehlen:** Lange Schreib-Sessions mit minimaler visueller Ablenkung. Power-User die viele Stunden am Stueck arbeiten.

### Notizbuch *(neu)*
Helles Papier mit Linien-Optik wie ein Notizbuch. Der Editor bekommt subtile horizontale Linien (1.6em Zeilenhoehe) und einen roten Rand-Strich am linken Rand. Lora als Serifen-Schrift. Dark-Variante erhaelt die gleichen Linien mit angepassten Farben.

**Wann waehlen:** Handschriftliches Schreibgefuehl, Brainstorming, Notizbuch-aehnliche Workflows.

## Hell/Dunkel-Variante

Jede der sechs Paletten existiert in einer Hell- und einer Dunkel-Variante. Die Umschaltung ist unabhaengig von der Palettenwahl - ein Klick auf das Sonne/Mond-Icon toggelt zwischen Hell und Dunkel, die Palette bleibt erhalten. So ergeben sich insgesamt zwoelf Theme-Varianten.

## Technische Hinweise

- Alle Themes nutzen dieselben CSS-Variablen. Plugins die eigene UI einblenden koennen ohne Anpassung alle Themes unterstuetzen indem sie `var(--bg-*)`, `var(--text-*)`, `var(--accent)`, `var(--border)`, `var(--shadow-*)` nutzen statt hardcoded Farbwerte.
- Alle Schriftarten sind lokal eingebettet (O-01 abgeschlossen). Es werden keine externen Schriftarten-Dienste kontaktiert.
- Die Theme-Einstellung wird im `localStorage` des Browsers gespeichert (`bibliogon-app-theme` fuer die Palette, `bibliogon-theme` fuer Hell/Dunkel). Beim ersten Start folgt Bibliogon der System-Praeferenz fuer Hell/Dunkel, die Palette faellt auf Warm Literary zurueck.
