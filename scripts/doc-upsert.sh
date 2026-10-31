#!/usr/bin/env bash
# Usage: bash scripts/doc-upsert.sh <slug> "<Titel>" <datei.md>
# Schreibt/aktualisiert ein Konzept in D1 (Tresor -> 📄 Konzepte).
set -euo pipefail
slug="$1"; title="$2"; file="$3"
[[ "$slug" =~ ^[a-z0-9-]{1,64}$ ]] || { echo "bad slug"; exit 1; }
tmp=$(mktemp --suffix=.sql)
python3 - "$slug" "$title" "$file" > "$tmp" <<'PY'
import sys,time
q=lambda s:"'"+s.replace("'","''")+"'"
slug,title,f=sys.argv[1:]
body=open(f,encoding='utf-8').read()
print(f"INSERT INTO docs (slug,title,body_md,updated_at) VALUES ({q(slug)},{q(title)},{q(body)},{int(time.time()*1000)}) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, body_md=excluded.body_md, updated_at=excluded.updated_at;")
PY
npx wrangler d1 execute jeffa-kollab --remote --file "$tmp" >/dev/null
rm -f "$tmp"
echo "ok: $slug aktualisiert"
