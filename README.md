# ECOMPRO · Semáforo Dropi GT

Tablero privado de un solo archivo (`private/ecompro.html`) que combina Lumy (pedidos de Dropi y landings), Meta Ads, TikTok Ads y DropKiller. Se sirve desde Vercel detrás de un inicio de sesión con Google.

- Secciones: Resumen, Logística (Pedidos, Dinero), Marketing (Landings, Meta, TikTok) e Investigación de mercado (Caza diaria, Mercado, Validador manual).
- Los datos de pedidos, Meta y TikTok son una foto al 7 de octubre de 2026 incrustada en el archivo.
- La Caza diaria, el Validador manual y los parámetros guardan sus datos en una base Upstash Redis (`api/db.js`). `api/_shim.js` imita la base del artefacto de Claude para que el tablero funcione igual en Vercel. La primera vez que se abre, la base se llena con lo que había en el artefacto (`private/seed.json`).

## Cómo está protegido

- `public/` solo tiene `robots.txt`. El tablero vive en `private/` y solo lo entrega `api/app.js` cuando hay sesión válida.
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
