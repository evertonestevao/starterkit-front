#!/usr/bin/env bash
# Publica uma NOVA versão dos Termos de Uso no Supabase LOCAL e a marca como
# vigente — todos os usuários serão forçados a reaceitar no próximo acesso.
#
# Uso:
#   bash scripts/publish-terms.sh                # v seguinte, conteúdo placeholder
#   bash scripts/publish-terms.sh caminho.md     # v seguinte, conteúdo do arquivo
#
# Em PRODUÇÃO, prefira publicar por migration (auditável e replicável):
# mesma lógica SQL abaixo dentro de um arquivo em supabase/migrations.
set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_starterkit_front}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "Container ${CONTAINER} não está rodando. Rode: npx supabase start" >&2
  exit 1
fi

if [ "${1:-}" != "" ]; then
  CONTENT="$(cat "$1")"
else
  CONTENT="# Termos de Uso — NOVA VERSÃO DE TESTE

**ATENÇÃO: TEXTO DE EXEMPLO (PLACEHOLDER),** publicado por scripts/publish-terms.sh
para validar o fluxo de reaceite. Substitua por texto revisado juridicamente
antes de uso real.

## O que mudou nesta versão
Esta linha existe para você distinguir a versão nova da anterior na tela."
fi

docker exec -i "$CONTAINER" psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -v content="$CONTENT" <<'SQL'
begin;
-- desmarca a vigente (índice único parcial permite só uma is_current)
update public.terms_versions set is_current = false where is_current;
insert into public.terms_versions (version, content, is_current)
select coalesce(max(version), 0) + 1, :'content', true from public.terms_versions
returning version, published_at;
commit;
SQL

echo "Versão publicada. Todos os usuários serão forçados a reaceitar."
