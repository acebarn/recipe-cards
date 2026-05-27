#!/usr/bin/env bash
set -euo pipefail
cd /app

# Add-on-Optionen (HA schreibt sie nach /data/options.json) → Umgebungsvariablen.
opt() { node -e 'const fs=require("fs");let o={};try{o=JSON.parse(fs.readFileSync("/data/options.json","utf8"))}catch(e){};process.stdout.write(String(o[process.argv[1]]??""))' "$1"; }
export TELEGRAM_BOT_TOKEN="$(opt telegram_bot_token)"
export ALLOWED_TELEGRAM_USERS="$(opt allowed_telegram_users)"
export PIXAZO_API_KEY="$(opt pixazo_api_key)"
export GEMINI_API_KEY="$(opt gemini_api_key)"

# Google-Drive-Bibliothek (rclone) – optional.
export DRIVE_REMOTE="$(opt drive_remote)"; [ -z "$DRIVE_REMOTE" ] && export DRIVE_REMOTE="drive"
export DRIVE_FOLDER="$(opt drive_folder)"; [ -z "$DRIVE_FOLDER" ] && export DRIVE_FOLDER="Rezepte"
RCLONE_CONF="$(opt rclone_config)"
if [ -n "$RCLONE_CONF" ]; then
  mkdir -p /root/.config/rclone
  printf '%s' "$RCLONE_CONF" > /root/.config/rclone/rclone.conf
  echo "rclone-Konfiguration geschrieben."
fi

# Rezept-Quellen persistent in /data: werden von Node gelesen, nicht von Typst,
# daher ist ein Symlink unkritisch (überlebt auch Add-on-Updates).
mkdir -p /data/recipes
rm -rf /app/recipes
ln -sfn /data/recipes /app/recipes

# Bilder und PDFs MÜSSEN für Typst innerhalb des Projekt-Roots (/app) liegen –
# ein Symlink nach /data würde von Typst aufgelöst und läge außerhalb von --root
# ("source file must be contained in project root"). Daher reale Ordner in /app.
# (Bilder überleben Neustarts; nach einem Add-on-Update werden fehlende neu erzeugt.)
mkdir -p /app/assets /app/out

# Bot starten; bei unerwartetem Ende automatisch neu starten (Netzwerk-Aussetzer etc.).
while true; do
  node scripts/bot.ts || echo "Bot beendet (Code $?) – Neustart in 5 s"
  sleep 5
done
