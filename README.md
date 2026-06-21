# SCHMACKOFATZ 🍳

Eine selbst-gehostete **Rezept-Web-App** im Bauhaus-Stil: Rezepte importieren (Foto,
Link, Text), in einer durchsuchbaren Bibliothek verwalten und als druckfertige
**A5-Rezeptkarten (Querformat, via [Typst](https://typst.app))** mit KI-Aquarell-Symbol
rendern. Dazu Einkaufsliste, Wochenplan, Vorratskammer und ein Statistik-Dashboard.

Die App läuft als **SvelteKit-Server** (Node-Adapter) mit **SQLite**-Bibliothek hinter
Google-Login. Ein **Telegram-Bot** und eine **CLI** teilen sich denselben Code; eine
optionale **Google-Drive-Sicherung** (rclone) hält Markdown + PDFs gespiegelt.

---

## Funktionen

**Bibliothek & Rezepte**
- Startseite mit Such-, Kategorie- und Region-Filtern (ein-/ausklappbar, farbcodiert),
  Listen-/Raster-Ansicht, Sortierung, „Neu"-Leiste und Umschaltern „nur meine Rezepte"
  sowie „vegetarisch/vegan" (Zutaten-Heuristik, in `localStorage` gemerkt).
- Rezeptseite mit Mengen-Skalierung, **Kochmodus**, **Rezeptkarte (PDF)**, Bearbeiten/
  Löschen (Besitzrechte), Bild-Neugenerierung (Admin).
- **Import** unter `/add` aus Link, Instagram-Reel, Text oder Foto(s) via Google Gemini.
- **Restefest** (`/restefest`): Rezept-Ranking nach vorhandenen Restzutaten.

**Einkaufen & Planen**
- **Einkaufsliste** über [Bring!](https://www.getbring.com/) – Zutaten eines Rezepts
  (skaliert) zusammenführen, Standardzutaten überspringen.
- **Vorratskammer** (`/inventar`): Inventar für Vorratsschrank & Tiefkühler, mit
  Mengen-Spinner, „wenig"-Markierung, Standardartikel-Vorlagen, Gruppen + gemerkter
  Zuordnung, und Vorschlägen aus zuletzt abgehakten Einkäufen. Beim „Auf die
  Einkaufsliste" fragt ein Dialog, was noch vorrätig ist.
- **Geteilter Haushalt**: Inventar mit anderen registrierten Nutzern teilen.
- **Wochenplan** + **Google-Kalender**: Rezepte als Mahlzeiten (Frühstück/Mittag/Abend/
  Zwischendurch) einplanen, auch wiederkehrend.

**Verwaltung**
- **Google-Login** mit Allowlist und Rollen (Owner/Admin/Mitglied); neue Nutzer landen
  in „ausstehend" bis zur Freigabe. Benutzerverwaltung unter `/admin/members`.
- **Einstellungen** (`/einstellungen`): Bring-Konto, Google-Kalender, Inventar an/aus,
  Haushalt, Benutzerverwaltung.
- **Statistik-Dashboard** (`/statistik`): Rezepte nach Kategorie, nach Land
  (interaktive Karte), häufigste Zutaten u. a.

---

## Tech-Stack

- **SvelteKit 2 / Svelte 5** (Runes), `@sveltejs/adapter-node`
- **SQLite** via `better-sqlite3` (WAL), Schema über eingebettete Migrationen
- **@auth/sveltekit** (Google OAuth)
- **Typst** für das PDF-Rendering der Karten, **Pixazo FLUX** für die Aquarell-Bilder,
  **Google Gemini** für den Import
- **bring-shopping** (Bring!), Google-Calendar-REST, **rclone** (Drive-Sicherung)
- Node ≥ 23.6 – TypeScript läuft ohne Build-Schritt direkt (auch in der CLI)

---

## Lokale Entwicklung

```bash
git clone https://github.com/acebarn/recipe-cards.git
cd recipe-cards
npm install
cp .env.example .env        # Keys/Secrets eintragen (siehe unten)
npm run dev                 # http://localhost:5173
```

**Login ohne Google (nur lokal):** Mit `RECIPE_DEV_USER=<mail einer existierenden,
freigegebenen DB-Mail>` wird der OAuth-Flow umgangen. Da Vite `.env` nicht ins echte
`process.env` legt, beim Start direkt voranstellen:

```bash
RECIPE_DEV_USER=du@example.com npm run dev
```

Weitere Befehle: `npm run build` / `npm run preview` (Produktion), `npm run check`
(svelte-check, Ziel 0 Fehler/0 Warnungen).

### Umgebungsvariablen (`.env`)

| Variable | Zweck |
|----------|-------|
| `AUTH_SECRET` | Auth.js-Secret (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google-OAuth-Client (Web) |
| `ORIGIN` | öffentliche URL (hinter Proxy nötig, z. B. für Callbacks) |
| `GEMINI_API_KEY` | Rezept-Import (Gemini) |
| `PIXAZO_API_KEY` | Aquarell-Bildgenerierung |
| `RECIPE_DB_PATH` | Pfad zur SQLite-DB (Standard `<root>/data/library.db`) |
| `RECIPE_PROJECT_ROOT` | Root für Typst/Assets (im Container `/app`) |
| `RECIPE_SYNC` | `1` aktiviert den Drive-Sync-Worker (sonst aus) |
| `DRIVE_REMOTE` / `DRIVE_FOLDER` | rclone-Remote bzw. Drive-Ordner (Standard `drive` / `Rezepte`) |
| `TELEGRAM_BOT_TOKEN` / `ALLOWED_TELEGRAM_USERS` | Telegram-Bot |
| `RECIPE_DEV_USER` | nur lokal: OAuth-Bypass |

Für die Kalenderfunktion müssen am OAuth-Client zusätzlich die Scopes
`calendar.events` + `calendar.readonly` freigegeben sein.

---

## Rezeptformat

Rezepte werden in der DB gehalten, aber als **Markdown mit YAML-Frontmatter** ein-/
ausgelesen (Round-Trip für Import/Drive). Beispiel:

```markdown
---
title: Zwiebelkuchen
category: brot            # Schlüssel, siehe Tabelle unten
region: Deutschland       # Land/Region → Flaggen-Emoji in der UI
tags: [deftig]
prep_time: 1:50           # "H:MM" oder reine Minuten
cook_time: 0:40
rest_time: 0:30
servings: 1
equipment: [auflaufform, pfanne]
difficulty: medium        # easy/medium/hard (dt. Synonyme erlaubt)
image_subject: a single slice of savory onion tart      # englische Bildbeschreibung
last_modified: 2025-10-20
---
# Zwiebelkuchen

## Zutaten
### Teig
- 250 g Mehl (Type 405)
### Füllung
- 1 kg Zwiebel

## Schritte
1. **Mehl** in eine Schüssel geben …

## Hinweise
- Mit Räucherpaprika verfeinern.
```

**Kategorie-Schlüssel:** `fruehstueck`, `vorspeisen`, `snacks`, `salate`, `suppen`,
`eintoepfe`, `hauptgerichte`, `beilagen`, `grundrezepte`, `saucen`, `brot`, `kuchen`,
`desserts`, `getraenke`. Zutaten dürfen nur Menge + Einheit + Zutat enthalten
(Zubereitungshinweise gehören in die Schritte).

---

## CLI & Hilfsskripte

Dieselbe Logik ist als CLI nutzbar (rendert Karten ohne laufenden Server):

```bash
npm start                                  # alle Rezepte aus ./recipes → ./out
npm start -- --category brot --scale 2     # filtern / Mengen skalieren
npm run import -- foto.heic                 # Foto/Link/Text → Rezept-Entwurf (Gemini)
npm run images                             # fehlende Aquarell-Bilder erzeugen (Pixazo)
npm run add -- "https://…/rezept"          # Import → Bild → PDF in einem Lauf
npm run refresh                            # bestehende Sammlung: Bilder + PDFs ergänzen
npm run bot                                # Telegram-Bot lokal starten
npm run seed                               # Bibliothek aus Google Drive in die DB ziehen
```

Die Karte besteht aus zwei A5-Seiten (Vorderseite: Metadaten + Zutaten + großes Aquarell;
Rückseite: Schritte + Hinweise). Die Grundfarbe ergibt sich aus `theme_color`, sonst aus
dem Bild, sonst deterministisch aus dem Titel. Voraussetzung fürs Rendern:
**Typst ≥ 0.14** im `PATH` (die Schrift *Jost* ist gebündelt).

---

## Telegram-Bot

Der Bot nimmt **Foto/Link/Text** im Chat entgegen, fährt die Pipeline und schickt die
fertige **PDF** zurück; danach kann das Rezept in die Bibliothek übernommen werden.
Er teilt sich Image, SQLite-DB und Assets mit der Web-App (siehe Deployment). Lokal:

```bash
# .env: TELEGRAM_BOT_TOKEN (@BotFather), optional ALLOWED_TELEGRAM_USERS=<id1>,<id2>
npm run bot
```

---

## Deployment (VPS, Docker)

Web-App und Bot laufen als zwei Container aus **demselben Image** hinter **nginx**
(Reverse-Proxy, siehe [`deploy/nginx-recipes.conf`](deploy/nginx-recipes.conf)). Sie
teilen sich `library.db` und den Assets-Ordner; der Drive-Sync-Worker läuft nur im
Web-Container (`RECIPE_SYNC=1`). Konfiguration liegt **außerhalb** des Repos in
`/opt/recipe-cards/web.env` bzw. `bot.env` (Secrets, mode 600).

Im Repo-Verzeichnis auf dem Server (`/opt/recipe-cards/app`):

```bash
git pull --ff-only
DOCKER_BUILDKIT=0 docker build -t recipe-web:latest .   # buildx zu alt für compose-build
docker compose up -d
```

Migrationen laufen automatisch beim Start. Details zu Volumes/Env: siehe
[`docker-compose.yml`](docker-compose.yml).

### Google-Drive-Sicherung (optional)

Bei aktivem Worker (`RECIPE_SYNC=1`) werden Rezepte (`.md`) und PDFs nach Kategorie in
Drive gespiegelt (per **rclone**, Remote-Config unter `~/.config/rclone`):

```
Rezepte/
  md/<Kategorie>/<rezept>.md
  pdf/<Kategorie>/<rezept>.pdf
```

---

## Projektstruktur

```
src/routes/        SvelteKit-Seiten (Bibliothek, Rezept, Import, Inventar, Wochenplan,
                   Einkaufsliste, Statistik, Einstellungen, Admin, Login/Pending)
src/auth.ts        Google-OAuth (Auth.js)
core/              Domänenlogik: Parser, Skalierung, Theming, Render, Heuristiken
core/services/     DB + Migrationen, Bibliothek, Import, Bilder, Bring, Kalender,
                   Inventar, Drive-Sync, Nutzer
templates/         card.typ – Typst-Layout der Rezeptkarte
fonts/             gebündelte Schrift (Jost, OFL)
scripts/           CLI (cli.ts), import, gen-images, add, refresh, bot, seed
assets/            generierte Aquarell-Symbole (Cache)
recipes/           Rezept-Markdown (CLI-Eingabe / Seed-Quelle)
recipe-bot/        Legacy Home-Assistant-Add-on (durch VPS-Docker abgelöst)
deploy/            nginx-Konfiguration
Dockerfile, docker-compose.yml
```
