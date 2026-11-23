# ECOMPRO · Semáforo Dropi GT

Tablero privado de un solo archivo (`private/ecompro.html`) que combina Lumy (pedidos de Dropi y landings), Meta Ads, TikTok Ads y DropKiller. Se sirve desde Vercel detrás de un inicio de sesión con Google.

- Secciones: Resumen, Logística (Pedidos, Dinero), Marketing (Landings, Meta, TikTok) e Investigación de mercado (Caza diaria, Mercado, Validador manual).
- Meta Ads se actualiza en vivo (`/api/meta-sync`, cada 15 min con el tablero abierto). Los pedidos de Dropi entran por la sección **Dropi** (API en vivo), la extensión o la importación de archivos; TikTok sigue siendo una foto incrustada.
- La Caza diaria, el Validador manual y los parámetros guardan sus datos en una base Upstash Redis (`api/db.js`). `api/_shim.js` imita la base del artefacto de Claude para que el tablero funcione igual en Vercel. La primera vez que se abre, la base se llena con lo que había en el artefacto (`private/seed.json`).

## Cómo está protegido

- `public/` tiene solo archivos públicos (robots.txt, service worker y la extensión). El tablero vive en `private/` y solo lo entrega `api/app.js` cuando hay sesión válida.
- `api/login.js` y `api/callback.js` hacen el inicio de sesión con Google (OAuth, sin librerías). Solo entra un correo de la lista `ALLOWED_EMAILS`.
- La sesión es una cookie firmada (HMAC) de 7 días. `/logout` la borra.

## Variables de entorno en Vercel

| Variable | Qué es |
|---|---|
| `GOOGLE_CLIENT_ID` | ID de cliente OAuth de Google |
| `GOOGLE_CLIENT_SECRET` | Secreto de cliente OAuth de Google |
| `SESSION_SECRET` | Texto aleatorio de 32 caracteres o más para firmar la cookie |
| `ALLOWED_EMAILS` | Correos autorizados, separados por coma (por ejemplo `mil0803r@gmail.com`) |
| `KV_REST_API_URL` y `KV_REST_API_TOKEN` | Se crean solos al conectar Upstash Redis desde Vercel (Storage → Marketplace → Upstash Redis → conectar al proyecto) |
| `APP_URL` | Opcional: la dirección pública, por ejemplo `https://ecompro.vercel.app` |
| `ALERTAS_KEY` | Clave larga (texto aleatorio). Con ella Claude manda avisos de ventas a la campana 🔔 del tablero (`POST /api/alertas`, cabecera `x-alertas-key`). Sin esta variable el endpoint responde 503 |
| `DROPI_TOKEN` | Token de integración de Dropi (Sensible). Lo usa la sección **Dropi** (panel de pedidos en vivo) para leer `api.dropi.gt/integrations`. Nunca llega al navegador |
| `DROPI_TOKEN_2` | Token de integración de la **segunda** cuenta de Dropi (Sensible). La usa **Admin Dropi → Dropi 2**. Opcional: `DROPI_API_BASE_2` si esa cuenta es de otro país (por defecto `https://api.dropi.gt`) |
| `MCP_KEY` | Clave larga y aleatoria (Sensible) para el API REST y el servidor MCP (`api/mcp.js`). Sin ella responden 503 |
| `DROPI_LIVE_KEY` | Opcional. La extensión de Chrome ya entra con tu sesión del tablero y no necesita clave; esta variable solo sirve si prefieres usar una clave en lugar de la sesión |
| `META_ACCESS_TOKEN` | Token de un usuario del sistema de Meta con permiso `ads_read` (Sensible). Lo usa `/api/meta-sync` para traer las métricas en vivo |
| `META_ACCOUNTS` | Opcional: IDs de cuentas publicitarias de Meta a leer, separados por coma. Por defecto: Cuenta 1, Cuenta 3, Guatemala 2 y Guatemala 3 |
| `CRON_SECRET` | Texto largo y aleatorio. Vercel lo manda en el cron diario de `/api/meta-sync` |

## Google Cloud (una vez)

1. console.cloud.google.com → APIs y servicios → Pantalla de consentimiento OAuth (tipo Externo, deja la app en prueba y agrega tu correo como usuario de prueba).
2. Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web.
3. URI de redireccionamiento autorizado: `https://TU-DOMINIO.vercel.app/auth/callback`.
4. Copia el ID y el secreto a las variables de Vercel. No los pegues en el chat ni en el código.

## Asistente IA (opcional)

El botón "Asistente IA" del tablero usa `api/asistente.js`. Para activarlo agrega en Vercel (Settings → Environment Variables, tipo Sensible):

- `ANTHROPIC_API_KEY`: clave de la API de Anthropic (console.anthropic.com).
- `ASSISTANT_MODEL`: nombre del modelo a usar.
- `ASSISTANT_LIMIT` (opcional): preguntas por correo al día. Por defecto 80.

Cada pregunta envía solo un resumen compacto de los datos del tablero; la clave nunca llega al navegador.

## Avisos al celular
La campana 🔔 del tablero tiene el botón **Recibir avisos en este celular**. Al tocarlo (y aceptar el permiso) ese equipo queda registrado en la base (`ec:push`) y cada aviso que llega a `/api/alertas` también le llega como notificación, aunque la página esté cerrada.
- En iPhone hay que instalar primero la app: Compartir → Añadir a pantalla de inicio, y abrir ECOMPRO desde ese ícono.
- Las claves VAPID se crean solas la primera vez y se guardan en la base (`ec:cfg`); no hay que crear variables nuevas. Opcional: `VAPID_SUBJECT` (por defecto usa el primer correo de `ALLOWED_EMAILS`).
- El botón **Probar aviso** manda una notificación de prueba a los equipos registrados.

## API y MCP de ECOMPRO
Un solo archivo (`api/mcp.js`) da el servidor MCP y el API REST, protegidos con `MCP_KEY` (`Authorization: Bearer <clave>` o `x-api-key`).

- **MCP** (Streamable HTTP): `https://TU-DOMINIO/mcp`. En Claude: agregar conector personalizado con esa URL y la clave en la cabecera. Herramientas: `estado`, `leer_coleccion`, `leer_documento`, `guardar_documento` (solo winners, radar, tiktokshop, validations), `meta_ads`, `pedidos_dropi`, `crear_alerta`, `comprimir_imagen`.
- **REST**: `GET /api/v1` lista las herramientas; `GET|POST /api/v1/<herramienta>` con los argumentos en la query o en el JSON. Ejemplo: `curl -H "x-api-key: $MCP_KEY" "https://TU-DOMINIO/api/v1/pedidos_dropi?estado=E&desde=2026-11-01"`.
- Nunca devuelve teléfonos, direcciones ni nombres de clientes; `settings` y las huellas no se exponen.

### Compresor de imágenes por API y conexión con Codex
`comprimir_imagen` usa `sharp` en el servidor. Recibe una imagen y devuelve la comprimida (o la original si pesaría más).

- **REST con archivo binario** (hasta ~4 MB de subida por el límite de Vercel; el resultado llega como imagen): `curl -X POST --data-binary @foto.png -H "x-api-key: $ECOMPRO_MCP_KEY" -H "Content-Type: application/octet-stream" "https://TU-DOMINIO/api/v1/comprimir_imagen?formato=webp&calidad=80&ancho_max=1920" -o foto.webp`. Los datos del resultado vienen en la cabecera `X-Resumen`.
- **Carpeta completa:** `scripts/comprimir-imagenes.sh carpeta` (ver el encabezado del script).
- **MCP en Codex:** agrega en `~/.codex/config.toml`:
  ```toml
  [mcp_servers.ecompro]
  url = "https://TU-DOMINIO/mcp"
  bearer_token_env_var = "ECOMPRO_MCP_KEY"
  ```
  y define `ECOMPRO_MCP_KEY` (el mismo valor de `MCP_KEY`) en tu entorno. `AGENTS.md` ya le indica a Codex que comprima todas las imágenes con esta herramienta.
- Por `url` se aceptan imágenes públicas de hasta 25 MB (no se permiten direcciones internas).
