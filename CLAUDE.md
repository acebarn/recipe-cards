# SCHMACKOFATZ — Arbeitskontext

Selbst-gehostete Rezept-Web-App im Bauhaus-Stil für einen Familienhaushalt.
Live unter <https://recipes.alessiobisgen.de> (4 Nutzer, ~66 Rezepte). Der README
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
antwortet, Drive-Sync aktiv, rclone erreichbar, Import-Queue leer.

Frisch bereinigt (Commit `c0bec89`): **Telegram-Bot, datei-basierte CLI und
Alt-Artefakte sind entfernt** (`scripts/bot.ts`, `cli.ts`, `add.ts`, `refresh.ts`,
`import-photo.ts`, `gen-images.ts`, `core/filter.ts`, `recipes/`, `recipe-bot/`,
`repository.yaml`, der `bot`-Service in `docker-compose.yml`). Der Bot-Container
ist vom VPS entfernt.

## Offene Punkte

- **Redirect-Crash, Ursache unbekannt.** Zwischen 15.08. und 31.08. hat sich der
  Web-Prozess 15× mit `ERR_UNHANDLED_REJECTION` / Grund `#<Redirect>` beendet
  (Docker startete neu, teils 5 Crashes pro Minute). Seit Commit `1db4ec6` fängt
  ein `unhandledRejection`-Handler in `src/hooks.server.ts` das ab: der Server
  läuft weiter und loggt `Redirect(<status> → <ziel>)`. **Beim nächsten Vorfall das
  Ziel im Log ablesen** — `/login` deutet auf den Auth-Hook, `/recipe/<slug>` auf
  die Actions in `/add` bzw. `/recipe/[slug]/edit`. Lokal war es nicht
  reproduzierbar (404-Fuzzing, abgebrochene Requests, alle Routen auth/unauth).
- **Zwei Alt-Einträge in `sync_queue`** (id 78, 98, Status `error`, Juni): die
  Drive-Dateien sind längst weg, aber `purgeRecipe` lief nie — zwei soft-gelöschte
  Zeilen hängen noch in `recipes`. Aufräumen (Backup liegt unter
  `/opt/recipe-cards/web-data/library-backup-2026-09-04.db`):
  ```sql
  DELETE FROM recipes WHERE slug IN ('karotten-apfel-salat-nach-omas-rezept','instagram-rezept') AND deleted_at IS NOT NULL;
  UPDATE sync_queue SET status='done', processed_at=<jetzt> WHERE id IN (78,98);
  ```
- **Gemini Free-Tier-Tagescap:** Importe scheitern bei Erschöpfung (der Auto-Retry
  aus `import-queue.ts` fängt es ab, löst es aber nicht). Billing am Google-Key
  aktivieren.
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
