# SCHMACKOFATZ — Arbeitskontext

Selbst-gehostete Rezept-Web-App im Bauhaus-Stil für einen Familienhaushalt.
Live unter <https://recipes.alessiobisgen.de> (4 Nutzer, 64 Rezepte). Der README
beschreibt die Funktionen; diese Datei hält fest, was man beim Arbeiten am Code
wissen muss und nicht aus ihm ablesen kann.

**Sprache: Deutsch.** Antworten, UI-Texte, Code-Kommentare, Commit-Messages —
alles auf Deutsch. Englisch nur in `image_subject` (Prompt für die Bildgenerierung).

## Architektur in drei Sätzen

**SQLite ist die Quelle der Wahrheit** (`library.db`, better-sqlite3, WAL). Google
Drive ist ein *einseitiger* Backup-Mirror: der Sync-Worker schreibt Markdown + PDF
dorthin (inkl. Lösch-Propagierung), liest aber nie zurück. Die App ist ein
SvelteKit-Server (adapter-node) hinter Google-OAuth mit Allowlist; externe Dienste
sind Gemini (Import), Pixazo (Aquarell-Bilder), Typst (PDF-Karten), Bring
(Einkaufsliste) und Google Calendar (Wochenplan).

```
src/routes/        Seiten (Bibliothek, Rezept, /add, Inventar, Wochenplan,
                   Einkaufsliste, Statistik, Einstellungen, Admin, Login/Pending)
src/hooks.server.ts  Auth-Gate + Worker-Start + Crash-Guard
src/auth.ts        Google-OAuth (Auth.js), Scopes inkl. Kalender
core/              Domänenlogik (Parser, Skalierung, Theming, Typst-Render)
core/services/     DB + Migrationen, Bibliothek, Import(-Queue), Bilder, Bring,
                   Kalender, Inventar, Drive-Sync, Nutzer, Statistik
scripts/           nur noch Wartungsläufe gegen die DB (seed, Backfills, Icons)
templates/card.typ Typst-Layout der Rezeptkarte; fonts/ = gebündelte Jost
```

`$core` ist der Import-Alias für `core/` (in `svelte.config.js`).

### Speichermodell

Drei Orte, klare Rollen:

| Ort | Inhalt |
|-----|--------|
| SQLite `library.db` | Rezept doppelt: in Spalten (`ingredients_json`, `steps_json`, …) für UI/Suche **und** als `markdown_body` (Round-Trip-Original) |
| `web-data/assets/` | die Aquarell-Bilder als Dateien — Typst greift beim Rendern darauf zu |
| Drive `Rezepte/{md,pdf,assets}/` | einseitiger Backup-Spiegel |

**In die DB** wird synchron im Request geschrieben (better-sqlite3 ist synchron):
`insertRecipe` beim Import, `updateRecipe` beim Bearbeiten, `softDeleteRecipe`
beim Löschen (setzt nur `deleted_at`). Bild und Schritt→Zutat-Zuordnung tröpfeln
Sekunden später asynchron nach.

**Nach Drive** nie direkt, immer über die Tabelle `sync_queue`: `enqueueUpsert`
beim Import, Bearbeiten, Bild-Neugenerierung und nach der Bildablage
(`image-store.ts`), `enqueueDelete` beim Löschen. Der Worker (`drive-sync.ts`)
läuft nur mit `RECIPE_SYNC=1`, wird 200 ms nach jedem Schreibzugriff angestoßen
und zusätzlich alle 30 s; er liest `markdown_body` frisch aus der DB, rendert das
PDF neu und lädt md + pdf + Bild per rclone hoch. Fünf Fehlversuche → `error`.
Löschen ist Drive-gesteuert: die soft-gelöschte Zeile bleibt liegen, bis rclone
alle drei Dateien weg hat — erst dann `purgeRecipe`.

**PDFs werden nirgends dauerhaft gespeichert:** die Web-Ansicht rendert bei jedem
Abruf frisch nach `tmp` und löscht sofort; der Sync-Worker rendert seine eigene
Kopie für Drive.

**Dominierend ist SQLite.** Drive wird im Betrieb *nie* gelesen — der einzige
Rückweg ist `npm run seed` als manuelle Wiederherstellung.

### Nutzungsmessung

Seit 04.09. protokolliert die App, was getan wird — in `audit_log` (leer seit
Migration 001, befüllt seit 009), ausgewertet im Nutzungsblock auf `/statistik`
(`core/services/events.ts`).

Serverseitig verbucht: `recipe_view`, `cook_start`, `pdf_export` (erst nach
erfolgreichem Render), `import` (mit Quelle), `shopping_add`, `plan_meal`. Die
Suche filtert clientseitig über den Volldatensatz — sie meldet deshalb als
einzige entprellt an `POST /api/events`, der ausschließlich `search` von
angemeldeten Nutzern annimmt.

Alle Ranglisten sind nach **verschiedenen Personen** gewichtet
(`COUNT(DISTINCT user_id)`, danach erst die Anzahl) und zeigen beides an — bei
drei Haushaltsmitgliedern bestimmt sonst eine vielnutzende Person das Bild. Eine
Aufschlüsselung *pro Person* gibt es bewusst nicht.

**Regeln, die nicht aufgeweicht werden sollten:** keine IP, kein User-Agent,
kein Referrer; Suchbegriffe normalisiert und gekappt; Aufbewahrung 12 Monate
(täglicher Aufräumlauf via `startEventRetention()`); `recordEvent()` schluckt
jeden Fehler, weil Messen nie einen Request kosten darf. Bei drei namentlich
bekannten Nutzern ist jedes Event faktisch personenbezogen — deshalb bleibt die
Auswertung aggregiert.

## Lokal arbeiten

```bash
RECIPE_DEV_USER=alessio.bisgen@gmail.com npm run dev   # OAuth-Bypass, Port 5173
npm run check    # svelte-check — Ziel bleibt 0 Fehler / 0 Warnungen
npm run build    # Produktionsbuild (adapter-node)
```

Vite legt `.env` nicht in `process.env` — Variablen beim Start voranstellen.
`RECIPE_DEV_USER` muss auf eine **existierende, freigegebene** Mail in der DB zeigen.

`svelte-check` erfasst `scripts/` nicht (sie hängen nicht an `src/`). Nach
Änderungen dort zusätzlich prüfen:

```bash
npx tsc --noEmit --allowImportingTsExtensions --moduleResolution bundler \
  --module esnext --target es2023 --strict --skipLibCheck scripts/*.ts
```

## Deployment (VPS)

SSH-Zugang besteht als Host-Alias `server` — serverseitige Fixes selbst erledigen,
nicht davon ausgehen, man käme nicht dran. Vor dem Editieren von Configs ein `.bak`
anlegen, Secrets in Ausgaben maskieren.

```bash
git push origin main                                    # main ist kanonisch
ssh server 'cd /opt/recipe-cards/app && git pull --ff-only \
  && DOCKER_BUILDKIT=0 docker build -t recipe-web:latest . \
  && docker compose up -d web'
```

`DOCKER_BUILDKIT=0` ist nötig, weil buildx auf dem Server zu alt für
`compose build` ist. Migrationen laufen beim Start automatisch.

| Was | Wo auf dem Server |
|-----|-------------------|
| Repo | `/opt/recipe-cards/app` (Branch `main`) |
| Secrets | `/opt/recipe-cards/web.env` (mode 600), u.a. `BODY_SIZE_LIMIT=25M` |
| DB | `/opt/recipe-cards/web-data/library.db` |
| Bilder | `/opt/recipe-cards/web-data/assets` (34 MB) |
| rclone | `/opt/recipe-cards/data/rclone/rclone.conf` |
| nginx | aus `deploy/nginx-recipes.conf`, CF-Origin-Cert unter `/etc/ssl/cf-origin/` |

Davor: Cloudflare (Full-strict) → nginx → Container `recipe-web` auf
`127.0.0.1:3000`. Reine Env-Änderungen brauchen keinen Rebuild, nur
`docker compose up -d web`.

## Benachrichtigungen & Feedback

Freigabe-Anfragen (Erstanmeldung) und Rückmeldungen aus `/feedback` gehen per
**Telegram** raus — nicht per Mail. Der Grund steckt im DNS: `alessiobisgen.de`
trägt `v=spf1 -all`, DMARC `p=reject` mit strikter Ausrichtung und ein
Wildcard-DKIM `*._domainkey = "v=DKIM1; p="` (leerer Key). Die Domain ist
ausdrücklich als „versendet keine Mail" konfiguriert; jeder Mailweg hätte
DNS-Änderungen an drei Records erfordert.

Bot: `@delicious_recipe_card_bot` (derselbe Token wie beim abgeschafften
Rezept-Bot, aus `bot.env` nach `web.env` übernommen). **Kein eigener Prozess:**
Telegram pusht per Webhook auf `POST /api/telegram`, abgesichert über den
`X-Telegram-Bot-Api-Secret-Token`-Header. Das ist die einzige Route, die der
Auth-Hook durchlässt — Telegram kann sich nicht anmelden.

Empfänger tragen sich selbst ein, weil ein Bot nur Leute anschreiben darf, die
ihn gestartet haben: `/admin/benachrichtigungen` erzeugt einen Einmal-Code,
daraus wird ein `t.me/<bot>?start=<code>`-Deeplink, und der Webhook verknüpft
Code → Chat. Codes verfallen nach 24 h.

Webhook nach einem Domainwechsel neu setzen:

```bash
ssh server 'set -a; . /opt/recipe-cards/web.env; set +a
curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"$ORIGIN/api/telegram\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\"]}"'
```

Feedback wird **immer erst in der DB gespeichert** und dann gemeldet — fällt
Telegram aus, geht nichts verloren, und die Meldung an den Nutzer sagt ehrlich,
was passiert ist (zugestellt / niemand eingetragen / Zustellung fehlgeschlagen).

## Konventionen

- **Migrationen sind append-only.** Neue mit nächster id (`010_…`) ans Ende von
  `core/services/migrations.ts` hängen — eingebettete SQL-Strings, bewusst keine
  losen `.sql`-Dateien (Vite kopiert sie nicht ins Bundle).
- **Keine Tests im Projekt.** Änderungen werden über `npm run check`, `npm run build`
  und einen gezielten Smoke-Test gegen den gebauten Server verifiziert (Server mit
  eigener `RECIPE_DB_PATH` starten, nicht gegen die echte DB testen).
- **Trunk-based:** alles landet auf `main`, der Server zieht `main`.
- Kommentare erklären das *Warum*, nicht das Was; sie sind im Bestand deutsch und
  ganzsätzig.

## Ist-Zustand (Stand 2026-09-04)

Alles geprüft und grün: `svelte-check` 0/0, Build läuft, Container up, Seite
antwortet, Drive-Sync aktiv, rclone erreichbar, Import-Queue leer. **64 Rezepte /
64 Bilder, `sync_queue` ohne Fehler, keine soft-gelöschten Zeilen** — die zwei
Alt-Löschungen aus Juni und drei verwaiste Bild-Zeilen wurden am 04.09. bereinigt
(DB-Backup: `/opt/recipe-cards/web-data/library-backup-2026-09-04.db`, die
Bilddateien liegen unter `web-data/assets-verwaist-2026-09-04/`).

Der Drive-Spiegel ist seit 04.09. **vollständig: 64 md / 64 pdf / 64 Bilder.**
Vorher fehlten 21 Bilder (und die zugehörigen PDFs waren unbebildert), weil der
Upsert beim Import lief, bevor die Bildgenerierung fertig war — behoben in
`image-store.ts` (Commit `87cb45f`), die Altfälle wurden über die normale
sync_queue nachgezogen.

Noch offen: **`purgeRecipe()` räumt die `images`-Tabelle nicht mit ab** — beim
endgültigen Löschen eines Rezepts bleiben Bild-Zeile und Asset-Datei liegen (so
sind die drei Waisen entstanden).

Frisch bereinigt (Commit `c0bec89`): **Telegram-Bot, datei-basierte CLI und
Alt-Artefakte sind entfernt** (`scripts/bot.ts`, `cli.ts`, `add.ts`, `refresh.ts`,
`import-photo.ts`, `gen-images.ts`, `core/filter.ts`, `recipes/`, `recipe-bot/`,
`repository.yaml`, der `bot`-Service in `docker-compose.yml`). Der Bot-Container
ist vom VPS entfernt.

## Offene Punkte

- **App-Blockade — gefunden und behoben (06.09.).** Die App fror regelmäßig für
  *alle* Nutzer ein. Ursache waren synchrone Kindprozesse im einzigen
  Node-Event-Loop: `renderCard` rief Typst per `execFileSync` (durch die
  Auto-Fit-Schleife bis zu 17 Läufe je Karte), der Drive-Sync-Worker rclone per
  `spawnSync` (drei Netzaufrufe je Rezept). Am laufenden System gemessen: ein
  einzelner Drive-Upsert blockierte die App **7,2 s**, nach der Umstellung auf
  `execFile` (asynchron, mit Timeout) **0,27 s**. Merke: **in diesem Projekt nie
  wieder `*Sync`-Kindprozesse im Serverpfad** — jeder davon legt die ganze App
  für alle still.
- **Redirect-Crash, Ursache weiterhin offen.** Davon zu unterscheiden: zwischen
  15.08. und 31.08. hat sich der Prozess 15× mit `ERR_UNHANDLED_REJECTION` /
  Grund `#<Redirect>` beendet. Der Guard in `src/hooks.server.ts` hält den Server
  am Leben und loggt `Redirect(<status> → <ziel>)`; `tracedRedirect()` aus
  `src/lib/traced-redirect.ts` markiert alle sieben eigenen Redirect-Stellen.
  **Beim nächsten Vorfall sagt das Log die Antwort** — seit dem Deploy am 04.09.
  ist keiner mehr aufgetreten. Nicht mit der Blockade oben verwechseln: Das hier
  ist ein Prozessende, das war ein Hänger.
- **Lange Aktion ohne Rückmeldung:** „Bild neu generieren" wartet auf Pixazo
  (Zehner-Sekunden). Seit dem Fix blockiert das niemanden sonst mehr, aber die
  Seite des Admins wirkt in der Zeit tot — eine Fortschrittsanzeige fehlt.
- **Gemini Free-Tier-Tagescap:** Importe scheitern bei Erschöpfung (der Auto-Retry
  aus `import-queue.ts` fängt es ab, löst es aber nicht). Billing am Google-Key
  aktivieren.
- **`library.db` hat kein Backup.** Nach Drive gehen nur md, pdf und Bilder —
  die Datenbank selbst nicht. Nutzer, Inventar, Bring-/Kalender-Verknüpfungen und
  jetzt auch die Nutzungs-Events existieren nur einmal. Einzige Sicherung ist der
  manuelle Stand `/opt/recipe-cards/web-data/library-backup-2026-09-04.db`. Eine
  nächtliche Sicherung nach Drive wäre der nächste sinnvolle Schritt.
- **`users.telegram_id` bleibt im Schema**, obwohl der Bot weg ist: das Bot-Konto
  (`telegram-26670255@bot.local`, id 3) ist `created_by` von drei Rezepten.

## Aktueller Fokus

**Stabilität & Wartung** — Crash-Ursache dingfest machen, Betrieb absichern,
Altlasten abbauen. Neue Features erst danach.

## Diese Datei pflegen

Sie ist das Langzeitgedächtnis des Projekts. Nach jeder Session mit dauerhaftem
Erkenntnisgewinn hier nachziehen: geänderte Deployment-Schritte, neue
Konventionen, gelöste und neu entdeckte offene Punkte, Fokusverschiebungen.
Was im Code oder im README schon steht, gehört *nicht* hierher.
