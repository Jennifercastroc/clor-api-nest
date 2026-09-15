#!/usr/bin/env bash
#
# Siembra las tiendas de scripts/seed-stores.json en la tabla `stores` de Supabase.
# Usa SUPABASE_SERVICE_ROLE_KEY del .env de este repo (bypassea RLS) - correrlo solo
# manualmente, nunca desde el backend en runtime.
#
# NO es idempotente: si algún slug de seed-stores.json ya existe en `stores`, Supabase
# responde con un conflicto de unique constraint y el insert completo falla. Es intencional -
# no se agregó upsert acá, no vale la pena la complejidad para un seed que se corre una sola
# vez por tienda nueva.
#
# Uso: correr desde la raíz de outfit-optimizer-backend (donde está el .env):
#   ./scripts/seed-stores.sh

set -euo pipefail

if [ ! -f .env ]; then
  echo "Error: no se encontró .env en el directorio actual. Corre este script desde la raíz de outfit-optimizer-backend." >&2
  exit 1
fi

SUPABASE_URL=$(grep SUPABASE_URL .env | cut -d'=' -f2 | tr -d ' ')
SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env | cut -d'=' -f2 | tr -d ' ')

curl -s -i -X POST "${SUPABASE_URL}/rest/v1/stores" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  --data-binary "@scripts/seed-stores.json"
