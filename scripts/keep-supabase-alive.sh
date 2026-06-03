#!/bin/zsh
# Lokal daglig keep-alive för Supabase-projektet 'med-andra-ord'
# (ID lwzzmtrslerbhwitpqlf). Oberoende RESERV till GitHub Actions-workflowen
# .github/workflows/keep-supabase-alive.yml — om GitHub stänger av det
# schemalagda jobbet (sker efter 60 dagar utan commits) håller detta jobb
# ändå projektet vid liv så att det inte pausas pga 7 dagars inaktivitet.
#
# Körs av launchd-jobbet ~/Library/LaunchAgents/com.john.med-andra-ord.keepalive.plist
# Nyckeln är samma publishable-nyckel som finns publikt i index.html (skyddad av RLS).
set -eu

URL="https://lwzzmtrslerbhwitpqlf.supabase.co/rest/v1/mao_rooms?select=room_code&limit=1"
KEY="sb_publishable_56qru2-bdw6-9I6LKCSWtg_674Uq54p"
LOG="$HOME/Library/Logs/med-andra-ord-keepalive.log"

TS="$(date '+%Y-%m-%d %H:%M:%S %z')"
STATUS="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY" \
  "$URL" 2>>"$LOG" || echo 000)"

echo "$TS  HTTP $STATUS" >> "$LOG"
[ "$STATUS" = "200" ]
