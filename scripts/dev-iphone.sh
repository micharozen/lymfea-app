#!/usr/bin/env bash
#
# Lance le serveur Vite accessible depuis l'iPhone (même Wi-Fi), en pointant
# la Supabase locale sur l'IP LAN du Mac au lieu de 127.0.0.1.
#
# NE MODIFIE AUCUN FICHIER : VITE_SUPABASE_URL est défini uniquement pour ce
# process (la variable shell est prioritaire sur .env.local). Ton `bun dev`
# habituel continue d'utiliser 127.0.0.1 sans changement.
#
set -euo pipefail

DEV_PORT=8080
SUPA_PORT=54321

# IP LAN du Mac : Wi-Fi (en0), sinon Ethernet/USB (en1).
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -z "${IP}" ]; then
  echo "❌  Impossible de détecter l'IP LAN. Es-tu connecté au Wi-Fi ?" >&2
  exit 1
fi

# Avertit (sans bloquer) si la Supabase locale ne répond pas.
if ! curl -sf -o /dev/null "http://127.0.0.1:${SUPA_PORT}/auth/v1/health"; then
  echo "⚠️   Supabase locale injoignable sur :${SUPA_PORT} — lance d'abord 'bun sup:start'." >&2
fi

export VITE_SUPABASE_URL="http://${IP}:${SUPA_PORT}"

echo ""
echo "📱  iPhone (même Wi-Fi) → ouvre dans Safari :"
echo "        http://${IP}:${DEV_PORT}"
echo ""
echo "🔌  Supabase locale → ${VITE_SUPABASE_URL}"
echo "    (ton 'bun dev' normal reste sur 127.0.0.1, rien n'est modifié)"
echo ""

exec vite --host
