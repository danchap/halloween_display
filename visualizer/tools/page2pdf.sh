#!/usr/bin/env bash
# Print an HTML page to a PDF with headless Chrome.
#
# Usage: bash page2pdf.sh input.html output.pdf
#
# The page's own CSS sets the paper size and margins (@page); Chrome adds
# no header or footer. Chrome's own messages go to out/chrome-pdf.log next
# to its profile. At the end the script prints the PDF's path, size and
# page count (the count is from the PDF's own page objects).
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: bash page2pdf.sh input.html output.pdf" >&2
  exit 2
fi

in=$(realpath -e "$1")
out=$(realpath -m "$2")
mkdir -p "$(dirname "$out")"

outdir=/home/chappy/git/halloween_display/visualizer/out
profile=$outdir/chrome-pdf
mkdir -p "$profile"
rm -f "$out"

# Chrome is started with a clean environment: in this machine's shells it
# crashes at launch (crashpad) with the session's variables set.
timeout 180 env -i HOME="$HOME" PATH="$PATH" google-chrome --headless=new --no-sandbox \
  --use-angle=swiftshader --enable-unsafe-swiftshader \
  --user-data-dir="$profile" --disk-cache-size=1 \
  --no-pdf-header-footer --virtual-time-budget=5000 \
  --print-to-pdf="$out" "file://$in" > "$outdir/chrome-pdf.log" 2>&1 || true

if [ ! -s "$out" ]; then
  echo "page2pdf: Chrome wrote no PDF; see $outdir/chrome-pdf.log" >&2
  exit 1
fi

pages=$(python3 -c '
import re, sys
data = open(sys.argv[1], "rb").read()
print(len(re.findall(rb"/Type\s*/Page(?![s\w])", data)))
' "$out")
size=$(stat -c %s "$out")
echo "$out: $size bytes, $pages pages"
if command -v pdfinfo > /dev/null 2>&1; then
  pdfinfo "$out" 2> /dev/null | grep -E '^(Pages|Page size):' | sed 's/^/pdfinfo: /'
fi
