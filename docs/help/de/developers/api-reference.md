# API-Referenz

Bibliogons REST-API wird durch FastAPIs auto-generiertes OpenAPI-Schema dokumentiert. In dieser Doku-Seite gibt es keine handgepflegte Pro-Endpoint-Referenz — die würde im Moment driften, sobald ein neuer Endpoint ausgeliefert wird. Stattdessen den Client auf die unten genannten Live-Laufzeit-Endpoints zeigen lassen.

## Live-Endpoints (wenn Bibliogon läuft)

| Endpoint | Was er ausliefert |
|----------|-------------------|
| <http://localhost:7880/api/docs> | Interaktive Swagger-UI. Anfragen direkt aus dem Browser ausprobieren. Nur verfügbar bei `BIBLIOGON_DEBUG=true`. |
| <http://localhost:7880/api/redoc> | ReDoc-Rendering desselben Schemas. Nur verfügbar bei `BIBLIOGON_DEBUG=true`. |
| <http://localhost:7880/api/openapi.json> | Rohes OpenAPI-3.1-Schema. Die maschinenlesbare Quelle der Wahrheit. Nur verfügbar bei `BIBLIOGON_DEBUG=true`. |
| <http://localhost:7880/api/health> | Liveness-Check. Gibt 200 mit `{"status": "ok"}` zurück, sobald die DB erreichbar ist und Plugins geladen sind. Immer verfügbar. |

Produktiv-Deployments (`BIBLIOGON_DEBUG=false`) verbergen `/api/docs`, `/api/redoc` und `/api/openapi.json` absichtlich, um die Angriffsfläche zu reduzieren. Lokal in Debug-Modus schalten, um das Schema zu lesen.

## Authentifizierung

Bibliogon ist per Design **local-first und unauthentifiziert** — es gibt kein Benutzerkonten-System. Alle API-Aufrufe gehen ohne Credentials durch, sobald die lokale Instanz erreicht wird. Das Bedrohungsmodell nimmt die Host-Maschine als Vertrauensgrenze an; wer die API erreicht, hat vollen Zugriff.

Konsequenzen:

- **Bibliogons API nicht ins öffentliche Internet exponieren.** Selbst hinter einem Reverse-Proxy: Basic Auth oder die Auth-Schicht des Reverse-Proxies davorschalten, wenn mehrere Benutzer eine Instanz teilen.
- **`/api/test/reset` ist durch `BIBLIOGON_DEBUG=true` geschützt** — der Endpoint löscht alle Bücher, Artikel, Kapitel und Assets. Das Debug-Flag-Gate ist der einzige Schutz.
- **Der Bibliogon-Launcher bindet per Default an `localhost`**; das Docker-Produktiv-Setup bindet an den Host auf `BIBLIOGON_PORT`. Reverse-Proxy davor bei öffentlichen Deployments.

Eine echte Auth-Schicht (Multi-User, RBAC, Session-Tokens) ist für die aktuelle Single-Author-/Local-First-Phase **außerhalb des Scopes**. Wer Multi-Tenant-Bibliogon braucht: die Architektur unterstützt es, aber die Arbeit ist nicht eingeplant.

## Schema-Generierung

Das OpenAPI-3.1-Schema unter `/api/openapi.json` wird von FastAPI aus den Pydantic-v2-Schemas auf jeder Route auto-generiert. Programmatische Verwendung:

```bash
# Schema abrufen (braucht BIBLIOGON_DEBUG=true)
curl -s http://localhost:7880/api/openapi.json > openapi.json

# Python-Client generieren
poetry add --group dev openapi-python-client
poetry run openapi-python-client generate --path openapi.json

# TypeScript-Client generieren
npx openapi-typescript openapi.json -o api-types.ts
```

Bibliogons eigenes Frontend nutzt keines davon — `frontend/src/api/client.ts` schreibt die API-Oberfläche als getypte Methoden von Hand. Das ist die einzige Quelle der Wahrheit auf Frontend-Seite und das empfohlene Muster für jeden In-Tree-Konsumenten.

## Stabile Verträge

Die Endpoints unter `/api/books`, `/api/articles`, `/api/chapters`, `/api/assets`, `/api/templates`, `/api/chapter-templates`, `/api/backup` sind **stabil**. Neue optionale Felder können hinzukommen; bestehende Felder behalten ihre Form und Typen quer durch Minor-Releases.

Plugin-eigene Endpoints unter `/api/{plugin-name}/*` folgen der Version des Plugins, nicht der Bibliogon-Release-Version. Plugin-Versionen sind unabhängig von der App-Version (siehe [Architektur](architecture.md#versionierung)). Den Plugin-Quelltext für seinen Endpoint-Vertrag lesen.

`/api/test/reset` ist **ausdrücklich instabil** und nur für Debug. Nicht in Produktiv-Skripten verwenden.

## High-Level-Übersicht

Für eine themen-organisierte Sicht auf die API statt des Schema-Dumps siehe [docs/API.md](https://github.com/astrapi69/bibliogon/blob/main/docs/API.md). Diese Datei gruppiert Endpoints nach Feature-Bereich (Books, Chapters, Backup, Plugins, AI, ...) ist aber handgepflegt — im Zweifelsfall gewinnt das OpenAPI-Schema.

> Zuletzt geprüft für v0.29.0 (2026-05-07).
