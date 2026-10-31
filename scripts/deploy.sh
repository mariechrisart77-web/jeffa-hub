#!/usr/bin/env bash
# Build + deploy all Pages projects (hub apps + bild service)
set -euo pipefail
cd "$(dirname "$0")/.."
APPS="${@:-chat waechter hub}"
# v78: hub /api/image proxyt zum bild-Service -> hub und bild immer gemeinsam deployen
if [[ " $APPS " == *" hub "* && " $APPS " != *" bild "* ]]; then APPS="$APPS bild"; fi
if [[ " $APPS " == *" bild "* && " $APPS " != *" hub "* ]]; then APPS="$APPS hub"; fi
# v78: Commit in Health (build-info.ts wird nach dem Deploy zurückgesetzt)
cp src/build-info.ts /tmp/build-info.ts.bak
trap 'cp /tmp/build-info.ts.bak src/build-info.ts' EXIT
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo dev)$(git diff --quiet 2>/dev/null || echo -dirty)"
printf 'export const BUILD = { commit: "%s", version: "v78" };\n' "$COMMIT" > src/build-info.ts
node scripts/build.mjs >/dev/null
cp wrangler.toml /tmp/wrangler.toml.bak
trap 'cp /tmp/wrangler.toml.bak wrangler.toml; cp /tmp/build-info.ts.bak src/build-info.ts' EXIT
for app in $APPS; do
  { [ "$app" = bild ] || [ "$app" = backup ]; } && continue
  sed -e "s/^name = .*/name = \"jeffa-$app\"/" -e "s|^pages_build_output_dir = .*|pages_build_output_dir = \"dist/$app\"|" /tmp/wrangler.toml.bak > wrangler.toml
  npx wrangler pages deploy --project-name "jeffa-$app" --branch main --commit-dirty=true
done
if [[ " $APPS " == *" bild "* ]]; then (cd services/bild && npx wrangler pages deploy --project-name jeffa-bild --branch main --commit-dirty=true); fi
if [[ " $APPS " == *" backup "* ]]; then (cd services/backup && npx wrangler deploy); fi
