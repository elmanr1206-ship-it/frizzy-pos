#!/bin/sh
# Descarga las librerías (versiones fijas) a /vendor para servirlas desde el propio sitio.
# Se corre una sola vez con internet; luego: git add vendor && git commit
set -eu
cd "$(dirname "$0")/.."
mkdir -p vendor

bajar() { # url destino
  echo "-> $2"
  curl -fsSL "$1" -o "vendor/$2"
  [ -s "vendor/$2" ] || { echo "ERROR: $2 vacío"; exit 1; }
}

bajar "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.1/dist/umd/supabase.js" supabase.js
bajar "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"          html2canvas.min.js
bajar "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"               chart.umd.min.js
bajar "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"                xlsx.full.min.js

# Comprobación mínima: cada archivo debe definir su global
grep -q "createClient"  vendor/supabase.js        || { echo "ERROR: supabase.js no parece el UMD"; exit 1; }
grep -q "html2canvas"   vendor/html2canvas.min.js || { echo "ERROR: html2canvas.min.js"; exit 1; }
grep -q "Chart"         vendor/chart.umd.min.js   || { echo "ERROR: chart.umd.min.js"; exit 1; }
grep -q "XLSX"          vendor/xlsx.full.min.js   || { echo "ERROR: xlsx.full.min.js"; exit 1; }

( cd vendor && sha256sum *.js > SHA256SUMS )
echo "Listo. Ahora: git add vendor scripts && git commit -m 'vendor: librerías locales'"
