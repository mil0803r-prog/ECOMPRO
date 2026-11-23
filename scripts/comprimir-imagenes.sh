#!/usr/bin/env bash
# Comprime TODAS las imágenes de una carpeta con el compresor de ECOMPRO (API REST).
# Uso: ECOMPRO_URL=https://TU-DOMINIO ECOMPRO_MCP_KEY=clave scripts/comprimir-imagenes.sh <carpeta> [salida] [formato] [calidad] [ancho_max]
#   formato: original (por defecto) | jpg | png | webp | avif      calidad: 10-100 (80)      ancho_max: px (0 = no cambiar)
set -u
IN="${1:?Falta la carpeta de entrada}"; OUT="${2:-$IN/comprimidas}"; FMT="${3:-original}"; CAL="${4:-80}"; ANC="${5:-0}"
: "${ECOMPRO_URL:?Falta ECOMPRO_URL}"; : "${ECOMPRO_MCP_KEY:?Falta ECOMPRO_MCP_KEY}"
mkdir -p "$OUT"; ok=0; mal=0; antes=0; despues=0
while IFS= read -r -d '' f; do
  nom="$(basename "$f")"; tmp="$(mktemp)"; hdr="$(mktemp)"
  code=$(curl -sS -o "$tmp" -D "$hdr" -w '%{http_code}' -X POST --data-binary @"$f" \
    -H "x-api-key: $ECOMPRO_MCP_KEY" -H "Content-Type: application/octet-stream" \
    "$ECOMPRO_URL/api/v1/comprimir_imagen?formato=$FMT&calidad=$CAL&ancho_max=$ANC&nombre=$(printf %s "$nom" | jq -sRr @uri)")
  if [ "$code" = 200 ]; then
    sug=$(grep -i '^x-resumen:' "$hdr" | sed 's/^[^:]*: *//' | tr -d '\r' | jq -r .nombre_sugerido)
    a=$(stat -c%s "$f"); d=$(stat -c%s "$tmp"); antes=$((antes+a)); despues=$((despues+d)); ok=$((ok+1))
    mv "$tmp" "$OUT/${sug:-$nom}"; echo "OK   $nom: $a -> $d bytes"
  else
    mal=$((mal+1)); echo "FALLÓ $nom (HTTP $code): $(head -c 200 "$tmp")"; rm -f "$tmp"
  fi
  rm -f "$hdr"
done < <(find "$IN" -maxdepth 1 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.avif' -o -iname '*.gif' -o -iname '*.bmp' -o -iname '*.heic' \) -print0)
echo "Listo: $ok comprimidas, $mal con error. Antes $antes bytes, ahora $despues bytes. Salida: $OUT"
