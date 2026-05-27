# recipe-cards

Ein CLI-Tool, das eine Rezeptsammlung im YAML-/Markdown-Format scannt und daraus
druckfertige **A5-Rezeptkarten im Querformat** rendert – über ein
[Typst](https://typst.app)-Template im Bauhaus-Stil.

Jede Karte besteht aus genau zwei Seiten:

- **Vorderseite:** Titel, Metadaten (Zeiten, Portionen, Schwierigkeit), Zubehör und die Zutatenliste – dazu ein großes KI-Aquarell-Symbol des Gerichts.
- **Rückseite:** die Zubereitungsschritte (plus Hinweise), mit demselben Symbol kleiner oben rechts.

Pro Rezept wird eine Grundfarbe bestimmt, die sich durch Akzente, Flächen und Formen zieht.

---

## Voraussetzungen

- **Node.js ≥ 23.6** – die TypeScript-Dateien werden ohne Build-Schritt direkt ausgeführt.
- **[Typst](https://github.com/typst/typst) ≥ 0.14** im `PATH` (`typst --version`).
- Die Schrift **Futura** (auf macOS vorinstalliert). Fehlt sie, greift automatisch Helvetica Neue/Arial.
- *Optional* für die Bildgenerierung: ein **Pixazo-API-Key** (siehe [Bilder generieren](#bilder-generieren)).
- *Optional* für den Foto-Import: ein **Google-Gemini-API-Key** (siehe [Rezept aus Foto importieren](#rezept-aus-foto-importieren)).

## Installation

```bash
git clone https://github.com/acebarn/recipe-cards.git
cd recipe-cards
npm install
```

## Schnellstart

```bash
# Alle Rezepte aus ./recipes nach ./out rendern
npm start
```

Für jedes Rezept entsteht eine PDF in `out/`, z. B. `out/zwiebelkuchen.pdf`.
Die CLI meldet pro Karte die Seitenzahl und warnt, falls eine Karte über zwei Seiten läuft.

---

## Rezeptformat

Jedes Rezept ist eine `.md`-Datei mit **YAML-Frontmatter** (Metadaten) und einem
strukturierten Markdown-Body. Verzeichnisse unter `recipes/` werden rekursiv durchsucht;
`Recipe Template.md` und versteckte Dateien werden übersprungen.

```markdown
---
title: Zwiebelkuchen
tags:
  - quiche
category: backen
grouping: deftig
prep_time: 1:50        # "H:MM" oder reine Minutenzahl (z. B. 20)
cook_time: 0:40
rest_time: 0:30
servings: 1            # Zahl; mit --scale skalierbar
equipment:
  - auflaufform
  - pfanne
difficulty: medium     # easy/simple/einfach · medium/mittel · hard/schwer
source_url:
theme_color:           # optional, #hex – sonst Farbe aus Bild/Titel
image_subject: a single slice of savory onion tart topped with browned tofu cubes
last_modified: 2025-10-20
---
# Zwiebelkuchen

## Zutaten
### Teig
- 250 g Mehl (Type 405)
- ½ Pck. Trockenhefe
### Füllung
- 1 kg Zwiebel
- 200 g Schmand

## Schritte
1. **Mehl** in eine Schüssel geben …
2. Teig **10 Minuten** kneten …

## Hinweise
- Tofu lässt sich mit Räucherpaprika verfeinern.
```

### Felder im Frontmatter

| Feld | Pflicht | Beschreibung |
|------|:------:|--------------|
| `title` | ✓ | Titel der Karte |
| `tags` | | Liste von Schlagwörtern (für `--tag`) |
| `category` | | Kategorie (für `--category`) |
| `grouping` | | Gruppierung (für `--grouping`) |
| `prep_time` / `cook_time` / `rest_time` | | Zeit als `H:MM` **oder** Minutenzahl |
| `servings` | | Portionen (Zahl) |
| `equipment` | | Liste von Zubehör |
| `difficulty` | | `easy`/`medium`/`hard` (dt. Synonyme erlaubt) |
| `source_url` | | Quelle(n); wird auf der Karte nicht angezeigt |
| `theme_color` | | `#hex`-Grundfarbe; übersteuert die automatische Ermittlung |
| `image_subject` | | **englische** Bildbeschreibung fürs Aquarell-Badge |
| `image_prompt` | | vollständiger Bild-Prompt; übersteuert `image_subject` |

### Body

- `## Zutaten` – optional in `### Unterabschnitte` gegliedert, Einträge als `- …`.
- `## Schritte` (auch „Zubereitung") – nummerierte Liste `1. …`. `**fett**` wird als Fettdruck übernommen.
- `## Hinweise` (auch „Tipps") – Einträge als `- …`.

---

## Nutzung der CLI

```bash
node src/cli.ts [verzeichnis] [optionen]
# oder via npm (Argumente nach --):
npm start -- --category backen
```

| Option | Beschreibung |
|--------|--------------|
| `[verzeichnis]` | Ordner mit Rezepten (Standard: `./recipes`) |
| `--out <ordner>` | Zielordner für die PDFs (Standard: `./out`) |
| `--scale <faktor>` | Zutatenmengen skalieren, z. B. `2` oder `0,5` |
| `--category <name>` | nur Rezepte dieser Kategorie |
| `--tag <name>` | nur Rezepte mit diesem Tag |
| `--grouping <name>` | nur Rezepte dieser Gruppierung |
| `-h`, `--help` | Hilfe anzeigen |

**Mengen-Skalierung:** `--scale` rechnet nur die **Zutatenliste** um – inklusive
Unicode-Brüchen (`½ Pck. → 1 Pck.`, `¼ TL → ⅛ TL`). Schritttexte bleiben unverändert.

```bash
npm start -- --scale 2            # alle Mengen verdoppeln
npm start -- --category backen    # nur Kategorie "backen"
```

---

## Rezept importieren (Foto, Webseite oder Text)

Aus einem **Foto** (z. B. Kochbuchseite), einer **Webseiten-URL** oder reinem
**Rezepttext** lässt sich automatisch ein Rezept-Entwurf im Template-Format
erzeugen. Ein multimodales Model (**Google Gemini**, `gemini-3.5-flash`) liest die
Eingabe aus und füllt Frontmatter, Zutaten, Schritte und Hinweise – inklusive
eines englischen `image_subject` für die spätere Bildgenerierung.

Die **Eingabeart wird automatisch erkannt**:

| Eingabe | Verhalten |
|---------|-----------|
| Bilddatei(en) | Foto-Modus; mehrere Bilder = mehrseitiges Rezept (inkl. **HEIC**) |
| `http(s)`-URL | Webseite wird geladen, Beiwerk (Navigation/Werbung) ignoriert |
| Textdatei (`.txt`/`.md`) | Inhalt wird als Rezepttext gelesen |
| Fließtext / `-` | Text aus den Argumenten oder von stdin |

1. Gemini-API-Key hinterlegen ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)):

   ```bash
   cp .env.example .env
   # in .env eintragen:  GEMINI_API_KEY=dein-key
   ```

2. Importieren – je nach Quelle:

   ```bash
   npm run import -- foto.heic                       # Foto
   npm run import -- seite1.jpg seite2.jpg           # mehrseitiges Rezept
   npm run import -- "https://example.com/rezept"    # Webseite
   npm run import -- "500 g Mehl, 3 Eier … (Text)"   # Fließtext
   pbpaste | npm run import -- -                      # Text aus der Zwischenablage
   ```

| Option | Beschreibung |
|--------|--------------|
| `--category <name>` | Ziel-Kategorieordner erzwingen (sonst aus dem Inhalt abgeleitet) |
| `--stdout` | Ergebnis nur ausgeben, keine Datei schreiben |
| `--force` | vorhandene Datei überschreiben statt zu nummerieren |
| `--model <name>` | Gemini-Modell (Standard: `gemini-3.5-flash`) |

Der Entwurf landet als `.md` im passenden Kategorie-Ordner (z. B. `category: salate`
→ `recipes/4 salate/`).

> **Hinweis:** Das Ergebnis ist ein **Entwurf** – bitte vor dem Drucken prüfen und
> korrigieren. Danach `npm run images` (Aquarell-Bild) und `npm start` (Karte rendern).
>
> Manche Webseiten blockieren automatisierte Zugriffe (Fehler 403/404). In dem Fall
> einfach den Rezepttext kopieren und als Fließtext übergeben.

---

## Bilder generieren

Die Aquarell-Symbole werden mit **Pixazo FLUX.1 [schnell]** erzeugt und in `assets/<slug>.<ext>` gecacht.

1. API-Key hinterlegen (Pixazo-Dashboard → API Key):

   ```bash
   cp .env.example .env
   # in .env eintragen:  PIXAZO_API_KEY=dein-key
   ```

2. Bilder erzeugen:

   ```bash
   npm run images            # nur fehlende Bilder
   node scripts/gen-images.ts --force   # alle neu generieren
   ```

| Option | Beschreibung |
|--------|--------------|
| `--force` | vorhandene Bilder neu erzeugen |
| `--size <px>` | Kantenlänge (Standard: 1024) |
| `--steps <n>` | Diffusions-Schritte 1–8 (Standard: 4) |

Das Motiv steuerst du über `image_subject` (kurze **englische** Beschreibung) im
Rezept-Header; ohne Bild zeigt die Karte ein getöntes Platzhalter-Badge mit der Initiale.

---

## Grundfarbe pro Rezept

Die Farbe (Akzente, Flächen, Formen) wird in dieser Reihenfolge bestimmt:

1. `theme_color` im Header (`#hex`),
2. sonst eine repräsentative Farbe **aus dem generierten Bild**,
3. sonst ein deterministischer Wert aus dem Titel.

---

## Projektstruktur

```
recipes/             Rezepte (.md) – rekursiv, beliebige Unterordner
templates/           card.typ – Typst-Layout der Karte
fonts/               gebündelte Schrift (Jost, OFL) für reproduzierbares Rendering
src/                 CLI & Logik (Parser, Skalierung, Filter, Theming, Render)
scripts/             add.ts (Orchestrator), import-photo.ts, gen-images.ts, bot.ts
assets/              generierte Aquarell-Symbole
out/                 erzeugte PDFs (nicht versioniert)
recipe-bot/          Home-Assistant-Add-on (Telegram-Bot)
```

## Rezept in einem Schritt anlegen

```bash
npm run add -- foto.heic                    # Import → Bild → PDF in einem Lauf
npm run add -- "https://example.com/rezept"
npm run add -- "Rezepttext …"
```

---

## Telegram-Bot (komfortabelster Weg)

Ein Telegram-Bot nimmt **Foto, Link oder Text** direkt im Chat entgegen, fährt die
Pipeline und schickt die **fertige PDF zurück in den Chat**. Befehle wie `/start`
liefern eine Kurzhilfe. Anschließend fragt der Bot, ob das Rezept in die
**Bibliothek (Google Drive)** übernommen werden soll.

**Lokal testen** (z. B. auf dem Mac):

```bash
# .env: TELEGRAM_BOT_TOKEN (von @BotFather) und optional
#       ALLOWED_TELEGRAM_USERS=<id1>,<id2>   (eigene IDs via @userinfobot)
npm run bot
```

**Dauerbetrieb als Home-Assistant-Add-on** (empfohlen, läuft 24/7 auf dem Pi):

1. Home Assistant → **Einstellungen → Add-ons → Add-on-Store → ⋮ → Repositories**:
   `https://github.com/acebarn/recipe-cards` hinzufügen.
2. Add-on **„Rezeptkarten-Bot"** installieren.
3. Im Tab **Konfiguration** eintragen: `telegram_bot_token`, `allowed_telegram_users`
   (komma-getrennt), `pixazo_api_key`, `gemini_api_key`.
4. **Starten.** Danach dem Bot in Telegram ein Foto/Link/Text senden → PDF kommt zurück.

### Bibliothek in Google Drive

Nach Ansicht des PDFs bietet der Bot **„Ja, speichern" / „Nein"** an. Bei „Ja" werden
**Rezept (.md), PDF und Bild** in eine **kategorisierte Ordnerstruktur** in Google Drive
gelegt: `Rezepte/<Kategorie>/`. Verschoben wird per **rclone**.

Einrichtung (einmalig):

1. **Drive-Ordner** `Rezepte` anlegen. Bei Service-Account-Nutzung den Ordner für die
   Service-Account-E-Mail **freigeben** (Bearbeiter); bei OAuth entfällt das.
2. **rclone-Remote** erstellen: auf einem Rechner `rclone config` ausführen (Typ `drive`,
   OAuth **oder** Service-Account). Den Namen des Remotes merken (Standard hier: `drive`).
3. Inhalt von `rclone.conf` (Ausgabe von `rclone config file` → Datei anzeigen) in die
   Add-on-Option **`rclone_config`** kopieren. Optional `drive_remote` und `drive_folder`
   anpassen (Standard `drive` bzw. `Rezepte`).

Ist `rclone_config` leer, entfällt die Speichern-Abfrage – der Bot schickt nur die PDF.

Technik: Long-Polling (nur ausgehende Verbindungen, kein offener Port), Typst-aarch64
+ gebündelte Schrift im Container, rclone für Drive, Auto-Neustart bei Aussetzern.
Add-on-Dateien: [`recipe-bot/`](recipe-bot/).
