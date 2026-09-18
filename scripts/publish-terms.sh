#!/usr/bin/env bash
# Publica uma NOVA versão dos Termos de um público e a marca como vigente.
# Quem aceitou a versão anterior daquele público é forçado a reaceitar.
#
# Uso:
#   bash scripts/publish-terms.sh igreja        supabase/terms/igreja.md
#   bash scripts/publish-terms.sh patrocinador  supabase/terms/patrocinador.md
#
# Banco remoto (o mini PC, por exemplo): exporte SUPABASE_DB_URL e tenha psql
# no PATH. Sem a variável, usa o container Docker local.
#
# Em PRODUÇÃO, prefira publicar por migration (auditável e replicável), como
# em supabase/migrations/20260919120000_terms_por_publico.sql.
set -euo pipefail

AUDIENCE="${1:-}"
FILE="${2:-}"

if [[ "$AUDIENCE" != "igreja" && "$AUDIENCE" != "patrocinador" ]]; then
  echo "Informe o público: igreja ou patrocinador." >&2
  echo "Uso: bash scripts/publish-terms.sh <igreja|patrocinador> <arquivo.md>" >&2
  exit 1
fi
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Arquivo de termos não encontrado: ${FILE:-<vazio>}" >&2
  exit 1
fi

CONTENT="$(cat "$FILE")"

# Só a vigente DAQUELE público é desmarcada. Desmarcar todas tiraria do ar o
# contrato do outro público, e o aceite dele passaria a falhar.
read -r -d '' SQL <<'SQL' || true
begin;
update public.terms_versions
  set is_current = false
  where is_current and audience = :'audience';
insert into public.terms_versions (audience, version, content, is_current)
select :'audience', coalesce(max(version), 0) + 1, :'content', true
from public.terms_versions
where audience = :'audience'
returning audience, version, published_at;
commit;
SQL

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "SUPABASE_DB_URL definido, mas psql não está no PATH." >&2
    exit 1
  fi
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
    -v audience="$AUDIENCE" -v content="$CONTENT" <<<"$SQL"
else
  CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_starterkit_front}"
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "Container ${CONTAINER} não está rodando, e SUPABASE_DB_URL não foi definido." >&2
    exit 1
  fi
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -v audience="$AUDIENCE" -v content="$CONTENT" <<<"$SQL"
fi

echo "Versão publicada para '${AUDIENCE}'. Quem aceitou a anterior será forçado a reaceitar."
