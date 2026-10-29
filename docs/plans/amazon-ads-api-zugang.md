# Plan: Zugang zur Amazon Ads API beantragen

Stand: 2026-10-29 · Zugehöriges Issue: #1151 · Regel: `.claude/rules/official-interfaces.md`

Ziel: Bibliogon holt die Werbedaten (Kosten, Klicks, Bestellungen pro Kampagne
und ASIN) über die **offizielle** Amazon Ads API, statt dass du den
„Advertised product“-Report jeden Monat von Hand herunterlädst. Die
KDP-Tantiemen bleiben beim Download: Dafür gibt es keine offizielle Schnittstelle.

> Diese Datei ist zum Bearbeiten gedacht. Hake ab, was erledigt ist, und trag
> unter „Notizen“ ein, was du beim Antrag siehst. Stellen mit **ungeprüft**
> stammen aus Anleitungen Dritter, nicht aus Amazons eigener Doku (die war in
> der Claude-Sitzung nicht erreichbar). Prüfe sie gegen den offiziellen
> Onboarding-Leitfaden von Amazon (Link unten).

## Vorab klären

- [ ] **Welches Konto?** Melde dich bei https://advertising.amazon.com mit der
      E-Mail an, über die deine Buchanzeigen laufen (dieselbe wie bei KDP, falls
      du die Anzeigen aus dem KDP-Bücherregal startest). Alle folgenden Schritte
      müssen mit **genau dieser** E-Mail passieren.
- [ ] **Hast du aktive oder vergangene Kampagnen?** Amazon prüft beim Antrag,
      ob echte Werbeaktivität vorliegt; eine Kampagnenhistorie hilft
      (**ungeprüft**, laut Drittanleitungen).
- [ ] **Die offene Kernfrage:** Sind die Report-Schnittstellen für Sponsored
      Products auch für **KDP-Autorenkonten** freigegeben? Amazon schreibt, die
      Sponsored-Ads-API unterstütze Autoren beim Anlegen und Verwalten von
      Kampagnen; zu Reports für Autorenkonten habe ich nichts Offizielles
      gefunden. Wenn du im Antrag ein Freitextfeld hast: genau das fragen.

## Schritt 1: Login-with-Amazon-Sicherheitsprofil anlegen

Kostenlos, ohne Prüfung (laut Drittanleitungen).

- [ ] https://developer.amazon.com öffnen, mit **derselben E-Mail** anmelden.
- [ ] „Login with Amazon“ wählen → „Create a New Security Profile“.
- [ ] Name z. B. `Bibliogon (privat)`, Beschreibung: „Eigene Werbedaten für
      die Auswertung in Bibliogon abrufen“.
- [ ] Unter „Web Settings“ eine **Allowed Return URL** eintragen. Vorschlag:
      `http://localhost:8000/api/kdp/finance/ads/oauth/callback`
      (Bibliogon läuft lokal; die genaue Route legen wir beim Bau fest und du
      passt sie hier ggf. an).
- [ ] **Client ID** und **Client Secret** notieren - **nicht** in Chat, E-Mail,
      Repo oder Bibliogon-Backup. Ablage: Passwortmanager. Später kommen sie in
      `~/.config/bibliogon/secrets.yaml` oder als Umgebungsvariable.

## Schritt 2: API-Zugang beantragen

- [ ] Bei https://advertising.amazon.com mit derselben E-Mail anmelden und den
      Antrag für die Ads API öffnen (Einstieg über die API-Seite von Amazon Ads;
      der genaue Menüpunkt kann sich ändern).
- [ ] Rolle: **Direct Advertiser** - du verwaltest deine **eigenen** Anzeigen,
      nicht die anderer. Nicht als Agentur oder Software-Anbieter (Partner)
      bewerben: Bibliogon ist ein privates Werkzeug, kein Dienst für Dritte.
- [ ] Laut Drittanleitung (**ungeprüft**): unter „Data and access“ →
      *Advertising*, unter „Development resources“ → *In-house developer(s)*.
- [ ] Verwendungszweck ehrlich und knapp, Vorschlag:

      > I am a self-published author (Amazon KDP) running Sponsored Products
      > campaigns for my own books. I want to read my own campaign performance
      > (spend, clicks, orders per advertised ASIN, monthly) into a private,
      > local tool to calculate the profitability of each title. Read-only
      > reporting; no campaign management, no access for third parties.

- [ ] Antrag absenden. Dauer laut Drittquellen: etwa ein Werktag, ältere
      Angaben sprechen von bis zu 72 Stunden (**ungeprüft**).

## Schritt 3: Zugang dem Sicherheitsprofil zuordnen

- [ ] Nach der Freigabe kommt eine E-Mail mit einem Link zur Zuordnung.
- [ ] Link **nur** öffnen, während du mit derselben E-Mail bei Amazon angemeldet
      bist - sonst wird er laut Drittanleitungen ungültig.
- [ ] Das Sicherheitsprofil aus Schritt 1 auswählen.
- [ ] **Achtung:** Nach Annahme der Lizenzvereinbarung lässt sich das verknüpfte
      Profil angeblich nicht mehr ändern (**ungeprüft**). Also wirklich das
      richtige Profil wählen.

## Schritt 4: Übergabe an Bibliogon

Danach bin ich (Claude) dran, siehe #1151:

- [ ] Kurze Rückmeldung im Issue #1151: freigegeben ja/nein, Marketplaces
      deiner Kampagnen (z. B. DE, US), und ob Amazon etwas zu Reports für
      Autorenkonten gesagt hat. **Keine Zugangsdaten ins Issue.**
- [ ] Bibliogon bekommt: OAuth-Anmeldung (einmalig im Browser, lokal),
      Abruf der Profile pro Marketplace, Monats-Report pro Profil, Ablage in der
      bestehenden Tabelle für Werbekosten. Secrets nur in der lokalen
      Secrets-Datei, nie in Datenbank, Backup oder Finanz-Export.

## Wenn Amazon ablehnt oder Reports für Autoren nicht gehen

Kein Problem: Der manuelle Weg funktioniert schon. Monatlich den
„Advertised product“-Report (XLSX oder CSV) herunterladen und importieren.
Kein inoffizieller Ersatz - das schließt die Regel aus.

## Notizen

<!-- Hier eintragen, was beim Antrag passiert: Datum, Antworten, Rückfragen. -->

## Quellen

- Offizieller Onboarding-Leitfaden (PDF): https://m.media-amazon.com/images/G/01/decassets/Amazon_Ads_API_onboarding_guide.pdf
- Amazon: Erweiterung der Sponsored Ads für Autoren (inkl. API): https://advertising.amazon.com/resources/whats-new/sponsored-products-and-sponsored-brands-ads-expansion
- Amazon: Attribution für KDP-Autoren (Reporting-Endpunkt): https://advertising.amazon.com/resources/whats-new/amazon-attribution-kdp-authors
- KDP-Hilfe: Werbung für KDP-Bücher: https://kdp.amazon.com/en_US/help/topic/G201499010
- Drittanleitungen (Schritte, Dauer, Fallstricke): https://www.atom11.co/blog/amazon-ads-api-guide · https://www.databaaba.com/blog/amazon-ads-api-access/ · https://unified.to/blog/how_to_get_your_amazon_ads_api_key
