# Instrucciones para Codex en ECOMPRO

## Imágenes: siempre comprimirlas
Cada vez que subas, agregues o generes imágenes (productos, landings, anuncios), pásalas TODAS por el compresor de ECOMPRO antes de usarlas:

- Con el MCP `ecompro`: llama a `comprimir_imagen` una vez por imagen (`url` o `imagen_base64`, `formato` = `original` o `webp`, `calidad` 80, `ancho_max` 1920) y usa la imagen que devuelve.
- Con una carpeta completa: `scripts/comprimir-imagenes.sh <carpeta> [salida] [formato] [calidad] [ancho_max]` (necesita `ECOMPRO_URL` y `ECOMPRO_MCP_KEY` en el entorno, nunca escritas en el código).
- Si una imagen pesa más después de comprimirla, el servidor devuelve el original: no hay que hacer nada más.
- Nunca imprimas ni guardes la clave `ECOMPRO_MCP_KEY` en archivos del repositorio.
