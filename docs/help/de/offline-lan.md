# Offline-Modus und LAN-Zugriff

Bibliogon ist local-first: Deine Bücher liegen auf deinem eigenen Rechner, nicht in einer Cloud. Zwei Funktionen bauen darauf auf. Der Offline-Modus lässt dich an einem Buch weiterarbeiten, auch wenn das Backend gerade nicht erreichbar ist, und der LAN-Zugriff lässt ein Smartphone oder Tablet im selben Netzwerk Bibliogon öffnen und direkt auf deinem Desktop weiterschreiben.

Beide Funktionen sind freiwillig (Opt-in). Wenn du sie nie aktivierst, ändert sich nichts: Bibliogon spricht weiterhin genau wie bisher mit seinem Backend.

## Was der Offline-Modus macht

Normalerweise liest und schreibt der Editor über das Online-Backend (den "API"-Speicher). Wenn du ein Buch offline nimmst, hält Bibliogon zusätzlich eine Kopie dieses Buches in der eingebauten Datenbank deines Browsers (IndexedDB, intern "Dexie"-Speicher genannt).

Ein kleiner Verbindungswächter prüft, ob das Backend tatsächlich erreichbar ist. Er verlässt sich nicht nur auf das Signal "Du hast WLAN" des Betriebssystems, sondern fragt im Hintergrund alle paar Sekunden den Health-Endpunkt des Backends ab, um sicherzugehen. Solange das Backend antwortet, nutzt Bibliogon den Online-Speicher. Sobald es nicht mehr antwortet und mindestens ein Buch offline verfügbar ist, schaltet Bibliogon den Editor automatisch auf die Offline-Kopie um. Kommt das Backend zurück, schaltet es wieder zurück.

Diese ganze Mechanik startet erst, nachdem du ein Buch offline genommen hast. Auf einer reinen Desktop-Installation bleibt sie vollständig inaktiv.

## Ein Buch offline nehmen

1. Öffne das Buch im Editor.
2. Suche in der Editor-Seitenleiste (wo die Kapitelliste steht) die Offline-Schaltfläche. Solange das Buch noch nicht offline ist, zeigt sie ein Wolken-Download-Symbol und heißt "Offline nehmen".
3. Klicke darauf. Bibliogon holt das gesamte Buch in einer einzigen Anfrage (den kompletten Buch-Graphen: Metadaten, Kapitel und so weiter) und schreibt es in die lokale Datenbank deines Browsers.
4. Wenn es fertig ist, erscheint eine Bestätigungsmeldung und die Schaltfläche wechselt zu "Offline entfernen" (ein Wolke-aus-Symbol).

Sobald ein Buch offline ist, zeigt seine Karte im Dashboard ein kleines Wolken-Abzeichen, sodass du auf einen Blick siehst, welche Bücher offline verfügbar sind.

Um ein Buch nicht mehr offline vorzuhalten, klicke erneut auf dieselbe Schaltfläche ("Offline entfernen"). Das löscht die lokale Kopie dieses Buches. War es das letzte Offline-Buch, läuft der Verbindungswächter harmlos bis zum nächsten Neustart weiter, was im Online-Betrieb nichts kostet.

Tipp: Nimm ein Buch offline, bevor du eine stabile Verbindung verlässt, nicht danach. Der Download benötigt das Backend, also mache ihn, solange du noch verbunden bist.

## Offline bearbeiten

Wenn das Backend nicht erreichbar ist, zeigt Bibliogon oben in der App einen ruhigen Hinweisstreifen, der dir mitteilt, dass du offline bist und deine Änderungen lokal gesichert werden. Du kannst wie gewohnt weiterschreiben.

Jede Änderung, die du offline machst, wird in die lokale Kopie geschrieben und zusätzlich in einer Schreibwarteschlange festgehalten, in der Reihenfolge, in der du sie gemacht hast (zuerst hinein, zuerst hinaus). Nichts geht verloren und nichts wird schon gesendet; die Warteschlange wartet einfach darauf, dass die Verbindung zurückkommt.

Folgende Inhaltsarten unterstützen die Offline-Bearbeitung: Bücher, Kapitel und Texte (Anlegen, Ändern und Löschen). Andere Inhalte wie Bilderbuch-Seiten, Comics und Story-Bible-Einträge sind nicht Teil der Offline-Schreibwarteschlange, bearbeite diese also, solange du online bist.

## Synchronisieren beim Wiederverbinden

Sobald das Backend wieder erreichbar ist, arbeitet eine Hintergrund-Synchronisation die Warteschlange ab. Sie spielt deine vorgemerkten Änderungen in derselben Reihenfolge gegen das Live-Backend ab, in der du sie gemacht hast, was auch die sichere Reihenfolge ist (ein Buch wird vor seinen Kapiteln angelegt und so weiter).

Du bekommst Meldungen darüber, was passiert ist:

- Eine Erfolgsmeldung mit der Anzahl der synchronisierten Änderungen.
- Eine Warnung, falls ein Konflikt gefunden wurde, der deine Entscheidung braucht.
- Eine Fehlermeldung, falls einige Änderungen nicht synchronisiert werden konnten. Diese bleiben erhalten und werden nicht verworfen, sodass sie später erneut versucht werden können. Nichts wird ohne erfolgreiche Synchronisation aus der Warteschlange entfernt.

## Konflikte und wie sie gelöst werden

Ein Konflikt entsteht, wenn derselbe Datensatz auf dem Desktop geändert wurde, während dein anderes Gerät offline war, und deine Offline-Änderung diese Desktop-Änderung überschreiben würde.

Bibliogon ist vorsichtig damit, welche Fälle überhaupt einen Konflikt auslösen können:

- Buch-Metadaten gelten nach dem Prinzip "die letzte Änderung gewinnt" und lösen daher nie einen Konflikt aus.
- Neu angelegte Datensätze lösen nie einen Konflikt aus (es gab nichts, womit sie kollidieren könnten).
- Beim Ändern oder Löschen eines Kapitels oder Textes vergleicht Bibliogon die aktuelle Version auf dem Desktop mit dem Stand, der beim Herunterladen des Buches festgehalten wurde. Hat sich der Desktop zwischenzeitlich weiterbewegt, wird diese Änderung als Konflikt geparkt, statt still zu überschreiben.
- Ein Sonderfall ist das Bearbeiten eines Datensatzes, der auf dem Desktop gelöscht wurde, während du offline warst. Auch das wird als Konflikt markiert, damit du entscheiden kannst.

Wenn ein Konflikt geparkt wird, weist dich die Wiederverbindungs-Meldung darauf hin, ihn zu lösen. Du wählst dann pro Konflikt:

- Die mobile (Offline-)Version behalten: Deine Offline-Änderung wird zum Desktop durchgesetzt.
- Die Desktop-Version behalten: Deine Offline-Änderung wird verworfen und die Desktop-Kopie bleibt maßgeblich. Das ist die bevorzugte Richtung, weil der Desktop in Bibliogon die maßgebliche Quelle ist.

Für den Fall im Editor, in dem ein einzelnes Kapitel-Speichern mit einer neueren Server-Version kollidiert (zum Beispiel, weil ein anderer Tab zuerst gespeichert hat), zeigt Bibliogon einen Dialog mit Vorschau nebeneinander, sodass du "Deine Änderungen" mit der "Server-Version" vergleichen kannst, bevor du wählst: deine behalten, deine verwerfen oder deine als neues Kapitel speichern.

## Offline-Tipps und Grenzen

- Die Offline-Unterstützung deckt nur Bücher, Kapitel und Texte ab. Plane entsprechend für Bilderbücher, Comics und Story-Bible-Arbeit.
- Die lokale Kopie gilt pro Browser. Ein Buch in einem Browser offline zu nehmen, macht es nicht in einem anderen offline.
- Halte den Desktop als den Ort, an dem die echte, zusammengeführte Kopie liegt. Der Desktop ist per Entwurf maßgeblich, weshalb "Desktop behalten" die sichere Voreinstellung bei Konflikten ist.
- Wenn du ein Buch aus dem Offline-Speicher entfernst, stelle sicher, dass alle ausstehenden Offline-Änderungen dafür bereits synchronisiert wurden.

## Was der LAN-Zugriff macht

Der LAN-Zugriff stellt die gesamte App, also sowohl die Benutzeroberfläche als auch das Backend, unter einer einzigen Netzwerkadresse bereit, sodass ein anderes Gerät im selben WLAN (ein Smartphone oder Tablet) Bibliogon im Browser öffnen und deine Bücher bearbeiten kann. Zusammen mit dem Offline-Modus macht das aus einem zweiten Gerät eine bequeme Schreibfläche für unterwegs.

Das ist freiwillig und über einen Umgebungsschalter abgesichert, `BIBLIOGON_LAN_MODE`. Im normalen Entwicklungsablauf ist er aus und Bibliogon ist nur von deinem eigenen Rechner aus erreichbar.

## LAN-Zugriff aktivieren

Der LAN-Modus stellt das gebaute Frontend und das Backend gemeinsam auf einem Port bereit (`0.0.0.0:8000`), sodass das Smartphone alles unter einer URL erreicht, ohne Wechsel über Ursprungsgrenzen hinweg.

Zum Starten:

```
make dev-lan
```

Das baut zunächst das Produktions-Frontend-Paket (dasselbe wie `make build-frontend`) und startet dann das Backend mit aktiviertem LAN-Modus, gebunden an alle Netzwerkschnittstellen auf Port 8000. Es läuft im Vordergrund als ein einzelner Prozess; mit Strg+C stoppst du es. Bewusst gibt es kein automatisches Neuladen, denn ein Neuladen würde den PIN neu erzeugen und bestehende Sitzungen verwerfen.

Beim Start gibt das Terminal einen Banner aus mit:

- Einem scanbaren QR-Code für die Zugriffs-URL (mit bereits eingebettetem PIN).
- Der einfachen Zugriffs-URL in der Form `http://<deine-LAN-IP>:8000`.
- Dem 6-stelligen PIN.

Bibliogon erkennt die LAN-IP deines Rechners für den Banner automatisch.

## Die PIN-Sperre

Bibliogon hat keine Benutzerkonten, deshalb fügt der LAN-Modus einen leichtgewichtigen, vorab geteilten PIN hinzu, der verhindert, dass ein anderes Gerät im Netzwerk deine Bücher liest oder verändert.

- Bei jedem Start des LAN-Modus wird ein zufälliger 6-stelliger PIN erzeugt.
- Nach einem korrekten PIN hält das Gerät eine Sitzung (über einen Cookie), die 24 Stunden gültig bleibt.
- Falsche PINs sind begrenzt: drei Fehlversuche sperren dieses Gerät für 10 Minuten.

Das ist für vertrauenswürdige Heimnetzwerke gedacht. Es ist kein Schutz gegen einen entschlossenen Angreifer in einem feindlichen Netzwerk, nutze den LAN-Modus also nur in Netzwerken, denen du vertraust.

## Ein Smartphone verbinden, Schritt für Schritt

1. Starte am Computer den LAN-Modus mit `make dev-lan`.
2. Stelle sicher, dass das Smartphone im selben WLAN wie der Computer ist.
3. Scanne auf dem Smartphone entweder den QR-Code aus dem Start-Banner oder tippe die Zugriffs-URL (`http://<deine-LAN-IP>:8000`) in den Browser des Smartphones.
4. Hast du den QR-Code gescannt, öffnet sich die PIN-Seite mit bereits eingetragenem PIN und schickt sich selbst ab. Hast du die URL getippt, erscheint die PIN-Seite und du gibst den 6-stelligen PIN ein und tippst auf Entsperren.
5. Bibliogon öffnet sich und du kannst deine Bücher vom Smartphone aus bearbeiten.

## Ein zweites Gerät aus der App heraus einbinden

Sobald ein Gerät verbunden ist, musst du nicht zum Terminal-Banner zurückkehren, um ein weiteres hinzuzufügen. Öffne die Einstellungen, gehe zum Tab "Über" und suche die LAN-Zugriff-Karte. Sie zeigt die aktuelle Zugriffs-URL, den PIN und einen scanbaren QR-Code, sodass du das nächste Gerät darauf richten kannst, ohne Bibliogon zu verlassen. Diese Karte erscheint nur, wenn der LAN-Modus läuft.

Die Einstellungen erreichst du über den Zahnrad- oder Einstellungen-Eintrag in der App. Einen Überblick über die Einstellungs-Tabs findest du unter [Einstellungen](settings/sidebar.md).

## LAN-Tipps und Sicherheit

- Alle Geräte müssen im selben lokalen Netzwerk sein. Der LAN-Zugriff reicht nicht über das Internet.
- Behandle den PIN wie ein Passwort für deine Bücher, solange der LAN-Modus läuft. Jeder in deinem Netzwerk, der ihn hat, kann deine Arbeit lesen und bearbeiten.
- Der PIN ändert sich bei jedem Neustart des LAN-Modus, ein frischer Start macht also alte Sitzungen ungültig.
- Nutze den LAN-Modus nur in vertrauenswürdigen Netzwerken (zu Hause, nicht im öffentlichen WLAN).

## Verwandte Seiten

- [Einstellungen](settings/sidebar.md) für den Tab "Über" und die LAN-Zugriff-Karte.
- [Dashboard-Paginierung](dashboard/pagination.md) zum Finden von Büchern im Dashboard, wo das Offline-Wolken-Abzeichen erscheint.
- [Git-Sicherung](git-backup/basics.md) für eine versionierte Sicherung deiner Arbeit, die das local-first-Arbeiten ergänzt.
