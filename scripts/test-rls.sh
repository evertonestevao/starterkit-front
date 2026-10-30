#!/usr/bin/env bash
# Roda os testes de RLS contra o Supabase local (npx supabase start antes).
set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_starterkit_front}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "Container ${CONTAINER} não está rodando. Rode: npx supabase start" >&2
  exit 1
fi

for test_file in supabase/tests/*.sql; do
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$test_file"
done
