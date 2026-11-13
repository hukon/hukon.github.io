#!/usr/bin/env bash
# Builds cv/Nidhal-Dilmi-CV.pdf from cv/index.html with headless Chrome.
# Re-run after every content change to cv/index.html or assets/css/cv.css.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT="$ROOT/cv/Nidhal-Dilmi-CV.pdf"

cd "$ROOT"
rm -f "$OUT"
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "file://$ROOT/cv/index.html" >/dev/null 2>&1

[ -s "$OUT" ] || { echo "PDF was not created: $OUT" >&2; exit 1; }
PAGES="$(grep -a -c '/Type /Page$' "$OUT" || true)"
if [ "${PAGES:-0}" -eq 0 ]; then
  PAGES="$(grep -a -o '/Type /Page[^s]' "$OUT" | wc -l | tr -d ' ')"
fi
echo "Wrote cv/Nidhal-Dilmi-CV.pdf: $PAGES page(s), $(wc -c < "$OUT" | tr -d ' ') bytes"
