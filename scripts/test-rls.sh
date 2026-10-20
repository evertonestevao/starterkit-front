#!/usr/bin/env bash
# Roda os testes de RLS. Dois caminhos:
#
#   1. Banco remoto (o mini PC, por exemplo): exporte SUPABASE_DB_URL e tenha
#      psql no PATH.
#        SUPABASE_DB_URL=postgresql://postgres:postgres@192.168.3.240:54322/postgres \
#          npm run test:rls
#
#   2. Supabase local em Docker (npx supabase start), o caminho antigo.
set -euo pipefail

SQL_FILE="supabase/tests/rls_test.sql"

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "SUPABASE_DB_URL definido, mas psql não está no PATH." >&2
    echo "Instale o cliente do Postgres ou rode sem a variável (modo Docker)." >&2
    exit 1
  fi
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 < "$SQL_FILE"
  exit 0
fi

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_starterkit_front}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "Container ${CONTAINER} não está rodando." >&2
  echo "Rode 'npx supabase start', ou aponte para o banco remoto com SUPABASE_DB_URL." >&2
  exit 1
fi

docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < "$SQL_FILE"
