#!/usr/bin/env bash
# ===================================================================
# BACKUP — banco e fotos do Supabase para o Google Drive
#
# Roda sozinho toda semana pelo GitHub (.github/workflows/backup.yml).
# No Drive, dentro de "Backup Registro de Visitas":
#   banco/backup-AAAA-MM-DD.zip  — o banco daquele dia:
#       banco.sql        estrutura + dados, para restaurar inteiro
#       tabelas/*.csv    uma planilha por tabela, abre no Excel
#   fotos/               espelho do bucket: cada semana só as novas
#                        descem, para não gastar o tráfego do plano
#
# O repositório é público e o log da execução também: nada aqui imprime
# dado de visita, e-mail ou nome de arquivo — só totais.
#
# Precisa de: SUPABASE_DB_URL (conexão do "Session pooler"),
#             SUPABASE_URL e o remoto "gdrive" do rclone.
# ===================================================================
set -euo pipefail

DESTINO="gdrive:Backup Registro de Visitas"
BUCKET="fotos-visitas"
DATA=$(TZ=America/Sao_Paulo date +%F)
TRAB=$(mktemp -d)

# ---------- 1. banco ----------
mkdir -p "$TRAB/banco/tabelas"
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges \
        -f "$TRAB/banco/banco.sql"

for t in $(psql "$SUPABASE_DB_URL" -Atc \
             "select tablename from pg_tables where schemaname = 'public' order by 1"); do
  psql "$SUPABASE_DB_URL" -q -c \
    "\\copy public.\"$t\" to '$TRAB/banco/tabelas/$t.csv' csv header"
done

# Quem tem login: os vínculos de consultores apontam para estes ids.
psql "$SUPABASE_DB_URL" -q -c \
  "\\copy (select id, email, created_at, last_sign_in_at from auth.users order by email) to '$TRAB/banco/tabelas/auth_usuarios.csv' csv header"

(cd "$TRAB/banco" && zip -qr "$TRAB/backup-$DATA.zip" .)
rclone copy "$TRAB/backup-$DATA.zip" "$DESTINO/banco/"
echo "Banco: backup-$DATA.zip enviado ($(du -h "$TRAB/backup-$DATA.zip" | cut -f1))."

# ---------- 2. fotos (só as que o Drive ainda não tem) ----------
psql "$SUPABASE_DB_URL" -Atc \
  "select name from storage.objects where bucket_id = '$BUCKET' order by 1" \
  | sort > "$TRAB/no-banco.txt"
rclone lsf -R --files-only "$DESTINO/fotos" 2>/dev/null | sort > "$TRAB/no-drive.txt" || true
comm -23 "$TRAB/no-banco.txt" "$TRAB/no-drive.txt" > "$TRAB/faltam.txt"

falhas=0
while IFS= read -r nome; do
  [ -n "$nome" ] || continue
  mkdir -p "$TRAB/fotos/$(dirname "$nome")"
  curl -sf --retry 3 -o "$TRAB/fotos/$nome" \
       "$SUPABASE_URL/storage/v1/object/public/$BUCKET/$nome" || falhas=$((falhas + 1))
done < "$TRAB/faltam.txt"

if [ -d "$TRAB/fotos" ]; then
  rclone copy "$TRAB/fotos" "$DESTINO/fotos"
fi
echo "Fotos: $(wc -l < "$TRAB/no-banco.txt") no banco, $(wc -l < "$TRAB/faltam.txt") novas enviadas, $falhas falharam."

rm -rf "$TRAB"
[ "$falhas" -eq 0 ]
