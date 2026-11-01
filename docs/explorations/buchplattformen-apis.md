# Buchplattformen: Wer hat eine offizielle API, und was ist schnell integrierbar?

Stand: 2026-11-01 · Issue #1155 · baut auf Epic #917 (Stand 2026-09-30) auf ·
Regel: `.claude/rules/official-interfaces.md` (nur offizielle, dokumentierte Wege)

Dieses Dokument ist zum Bearbeiten gedacht. Ergänze unter „Notizen“, was du bei
Anbietern erfährst, und setze die Spalte „Status“ nach, wenn sich etwas klärt.

## Kurzfassung

- **Für die großen Shops gibt es fast nie eine offizielle Upload-API.** KDP,
  IngramSpark, Draft2Digital, Kobo, Barnes & Noble, tolino, StreetLib, BoD,
  epubli und tredition: In dieser Recherche keine öffentliche API gefunden. Dort
  bleibt es beim Hochladen von Hand - Bibliogon liefert die fertigen Dateien
  und eine Checkliste.
- **Echte, selbst nutzbare APIs** (Schlüssel ohne Partnervertrag): **Leanpub**,
  **Lulu** (Druck), **Gumroad** (Direktverkauf).
- **Eine API für viele Shops:** **PublishDrive** hat eine Distributions-API
  (Schlüssel auf Anfrage). Das ist der einzige gefundene Weg, Apple, Google,
  Kobo, B&N und Bibliotheken mit *einer* offiziellen Integration zu erreichen -
  aber noch zu bestätigen und mit Abo-Kosten.
- **Offiziell, aber schwergewichtig:** Google Play Books (automatische Abholung
  von ONIX + Dateien), Apple Books (Transporter + Paketformat), VLB (lizenziert).
- **Plattformneutraler Hebel:** ein **ONIX-3.0-Export**. ONIX ist das
  Branchenformat für Buch-Metadaten; Google Play, VLB und Aggregatoren nehmen es.

„Keine API gefunden“ heißt: nicht in den Suchergebnissen und nicht in den
Hilfeseiten der Anbieter. Es heißt nicht sicher, dass es keine gibt. Viele
Anbieterseiten waren aus der Claude-Sitzung nicht direkt abrufbar.

## Übersicht

Legende Aufwand: **S** = Tage, **M** = ein bis zwei Wochen, **L** = mehr, oder
hängt an Verträgen/Infrastruktur. **Geprüft** = durch offizielle Doku oder
Anbieter-Hilfeseite belegt; **ungeprüft** = nur aus Drittquellen.

### Selbst nutzbare APIs - schnell machbar

| Plattform | Was die API kann | Zugang | Aufwand | Nutzen für Bibliogon | Status |
|---|---|---|---|---|---|
| **Leanpub** | Vorschau erzeugen, veröffentlichen, Job-Status, Verkäufe (paginiert) und Verkaufsübersicht | API-Schlüssel im Autoren-Dashboard („Enable the Leanpub API“) | S-M | Veröffentlichen per Knopfdruck + Verkäufe in den Finanz-Import. Haken: Leanpub baut das Buch aus *seinen* Quellen (Markua/Markdown aus Git, Dropbox oder dem Browser); Bibliogon müsste das Manuskript dorthin liefern - z. B. über das vorhandene `plugin-git-sync`. | geprüft (offizielle Hilfeseite) |
| **Lulu Print API** | Druckaufträge, Kostenberechnung, Status, Sendungsverfolgung, Webhooks, Sandbox | Client-Key/Secret (OpenID Connect) | M | Autorenexemplare oder eigener Shop-Druck aus dem vorhandenen Druck-PDF (#583/#606). **Haken:** Innenteil und Umschlag müssen unter einer **URL** liegen, von der Lulu sie abholt - eine lokale Desktop-App hat keine. Braucht eine Antwort, wo die Dateien kurzzeitig liegen. | Issue #922; URL-Pflicht ungeprüft (Drittquelle + Lulu-Hilfe) |
| **Gumroad** | Produkt anlegen, Datei hochladen, Verkäufe | OAuth-Token, API v2 | M | Direktverkauf von EPUB/PDF ohne Shop-Provision der großen Händler, Verkäufe in den Finanz-Import. | ungeprüft (nur Community-Doku zur offiziellen CLI) |

### Eine API für viele Shops - lohnt sich, wenn bestätigt

| Plattform | Was die API kann | Zugang | Aufwand | Nutzen | Status |
|---|---|---|---|---|---|
| **PublishDrive** | Buch anlegen, Dateien hochladen und anhängen, veröffentlichen - für E-Book, Print-on-Demand und Hörbuch; Sandbox | API-Schlüssel vom Support | M-L | Ein Knopf, viele Shops und Bibliotheken. Kostet ein PublishDrive-Abo. | ungeprüft: Referenz liegt auf einer `demo.dev`-Subdomain, bei PublishDrive bestätigen |

### Offiziell, aber schwergewichtig

| Plattform | Weg | Voraussetzung | Aufwand | Bewertung |
|---|---|---|---|---|
| **Google Play Books** | Automatische Abholung: Google holt EPUB/PDF und ONIX (2.1 oder 3.0) bzw. eine CSV von deinem Server, SFTP oder Google Cloud Storage | Partner-Center-Konto, Collection-Code, Musterdatei zur Freigabe | M-L | Machbar, sobald ONIX-Export existiert; braucht einen erreichbaren Ablageort. Geprüft (Google-Hilfe). |
| **Apple Books** | Transporter liefert ein Buchpaket nach Apples Book Package Specification (XML) | Apple-Books-Anbieterkonto, Steuer- und Bankdaten | L | Für Einzelautoren unverhältnismäßig; das Web-Portal „Apple Books for Authors“ ist der normale Weg. Transporter geprüft (Apple-Hilfe). |
| **VLB** (Deutschland) | REST-API v2, vor allem zum *Abrufen* von Metadaten; Verlage *liefern* per Web, Excel oder ONIX über FTP | Lizenz für Softwareanbieter, VLB-Teilnahme | L | Erst relevant mit eigenem Verlag und ISBNs aus Deutschland; ONIX-Export wäre der Lieferweg. Geprüft (VLB-Seiten). |

### Keine offizielle API gefunden - von Hand hochladen

| Plattform | Was Bibliogon liefern kann |
|---|---|
| **Amazon KDP** | Druck-PDF, EPUB, Metadaten, Checkliste (KDP-Paket, #741). Verkaufszahlen per Download-Import (#1129, #1147). Werbung: Amazon Ads API (#1151). |
| **IngramSpark** | Druck-PDF mit Beschnitt, EPUB, Metadaten. |
| **Draft2Digital** | EPUB, Metadaten. Verteilt von einem Upload an Apple, Kobo, B&N, Bibliotheken - der stärkste *manuelle* Hebel. |
| **Kobo Writing Life** | EPUB, Metadaten. |
| **Barnes & Noble Press** | EPUB, Druck-PDF. |
| **tolino media** | EPUB 3 (max. 100 MB), Metadaten. Verteilt an Thalia, Hugendubel, Osiander u. a. |
| **StreetLib** | EPUB, Metadaten. |
| **BoD, epubli, tredition** | Druck-PDF, EPUB - in dieser Recherche nichts zu Schnittstellen gefunden. |

Tools wie Vellum gehen denselben Weg: Sie erzeugen die Dateien, hochgeladen wird
von Hand. Browser-Erweiterungen, die Uploads bei Kobo oder KDP automatisieren,
fallen unter die Regel und sind tabu.

### Unterstützend: Metadaten nachschlagen

| Dienst | Was | Zugang | Aufwand |
|---|---|---|---|
| **Google Books API** | Suche per `isbn:` liefert Titel, Autoren, Verlag, Cover | API-Schlüssel (kostenlos, Kontingent) | S |
| **Open Library** | Buchdaten per ISBN (`/isbn/{isbn}.json`, `/api/books`) | ohne Schlüssel | S |

Nutzen: Metadaten eines bereits erschienenen Buches beim Anlegen vorbefüllen.
Open-Library-Details stammen aus Drittquellen (ungeprüft).

## Empfehlung: Reihenfolge

1. **Leanpub** (S-M) - nur, wenn du Leanpub nutzen willst. Schnellster echter
   „Veröffentlichen“-Knopf plus Verkaufsdaten, alles offiziell und ohne Partner.
2. **ONIX-3.0-Export** (M) - kein Konto nötig, macht Google Play, VLB und
   Aggregatoren erreichbar und zwingt die Buch-Metadaten in eine saubere Form.
3. **PublishDrive** (M-L) - erst eine Anfrage beim Support: API-Zugang, Kosten,
   welche Shops. Wenn ja, ist das der größte Hebel.
4. **Lulu** (#922, M) - sobald die Frage „wo liegen die Druckdateien als URL?“
   beantwortet ist.
5. **Gumroad** (M) - wenn Direktverkauf ein Ziel ist.
6. **ISBN-Lookup** (S) - kleiner Komfortgewinn, jederzeit.

Für Artikel-Plattformen (WordPress, Ghost, dev.to, Hashnode, Mastodon, Bluesky)
gilt die Bewertung in #917 weiter: dort sind APIs der Normalfall.

## Fragen an dich

- [ ] Nutzt du Leanpub oder willst du es nutzen? (Sonst fällt Platz 1 weg.)
- [ ] Willst du einen ISBN-Verlag in Deutschland (VLB) - jetzt oder später?
- [ ] Soll ich bei PublishDrive die API-Bedingungen anfragen lassen (Text für
      eine Mail an den Support liefere ich)?
- [ ] Direktverkauf über Gumroad: ja oder nein?

## Notizen

<!-- Hier eintragen, was du von Anbietern erfährst. -->

## Quellen

Geprüft heißt: offizielle Doku oder Hilfeseite des Anbieters in den Ergebnissen.

- Leanpub API (offiziell): https://leanpub.com/help/api
- Lulu Print API: https://www.lulu.com/sell/sell-on-your-site/print-api ·
  Dateien per URL: https://help.api.lulu.com/en/support/solutions/articles/64000254607-what-files-are-required-for-lulu-print-api-production- ·
  Entwickler: https://developers.lulu.com/home (aus #922)
- PublishDrive API-Referenz: https://api-docs.demo.dev.publishdrive.com/ ·
  E-Book-Beispiel: https://api-docs.demo.dev.publishdrive.com/example-ebook-upload
- Gumroad (Community-Doku zur offiziellen CLI): https://pkg.go.dev/github.com/antiwork/gumroad-cli@v0.20.0
- Google Play Books, automatische Abholung: https://support.google.com/books/partner/answer/2763162 ·
  Partner Center: https://support.google.com/books/partner/answer/3244021
- Apple Transporter: https://support.apple.com/guide/transporter-app/apda158c5f7c/mac ·
  Apple Books Partner: https://itunespartner.apple.com/books/support/
- VLB REST API: https://vlb.de/assets/images/VLB_REST_API_Version2_Anwenderspezifikation.pdf ·
  ONIX im VLB: https://vlb.de/hilfe/vlb-onix-empfehlungen/onix-im-vlb-übersicht
- tolino media: https://www.tolino-media.de/blog/how-to-publish-your-ebook/
- IngramSpark Hilfe: https://help.ingramspark.com/hc/en-us/articles/5281113497485-Getting-Started-and-Information-About-IngramSpark
- Barnes & Noble Press: https://press.barnesandnoble.com/bnpress-blog/bn-press-self-publishing-5-facts/
- StreetLib Hilfe: https://streetlib.helpscoutdocs.com/article/727-book-distribution
- Vellum, Upload an Aggregatoren: https://help.vellum.pub/uploading/aggregators
- Kobo Writing Life: https://help.kobo.com/hc/zh-tw/articles/360017771754
- Google Books API: https://developers.google.com/books/docs/v1/using
- Epic #917 (Quellen dort, u. a. KDP-Community zur fehlenden KDP-API)
