#!/usr/bin/env bash
set -euo pipefail
cd /app

# Add-on-Optionen (HA schreibt sie nach /data/options.json) → Umgebungsvariablen.
opt() { node -e 'const fs=require("fs");let o={};try{o=JSON.parse(fs.readFileSync("/data/options.json","utf8"))}catch(e){};process.stdout.write(String(o[process.argv[1]]??""))' "$1"; }
export TELEGRAM_BOT_TOKEN="$(opt telegram_bot_token)"
export ALLOWED_TELEGRAM_USERS="$(opt allowed_telegram_users)"
export PIXAZO_API_KEY="$(opt pixazo_api_key)"
export GEMINI_API_KEY="$(opt gemini_api_key)"

# Rezepte/Bilder/PDFs persistent in /data ablegen (per Symlink in den App-Baum).
# Geklonte Ordner zuerst entfernen, sonst landet der Symlink darin.
mkdir -p /data/recipes /data/assets /data/out
rm -rf /app/recipes /app/assets /app/out
ln -sfn /data/recipes /app/recipes
ln -sfn /data/assets  /app/assets
ln -sfn /data/out     /app/out

# Bot starten; bei unerwartetem Ende automatisch neu starten (Netzwerk-Aussetzer etc.).
while true; do
  node scripts/bot.ts || echo "Bot beendet (Code $?) – Neustart in 5 s"
  sleep 5
done
