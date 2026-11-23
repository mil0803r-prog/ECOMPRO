# Cómo está hecho el panel Dropi + Dashboard (y cómo copiarlo a otro país)

## 1. Piezas (todo en este repo, desplegado en Vercel)
| Pieza | Archivo | Qué hace |
|---|---|---|
| Tablero principal | `private/ecompro.html` | Un solo HTML. Menú lateral, Dashboard, Admin Dropi (barra de cuentas + iframe), Dinero, Registro diario, etc. |
| Panel Dropi | `private/panel-dropi.html` | Panel de 6 pestañas (resumen, pedidos, proveedores, favoritos, gestión, rendimiento). Se abre en un iframe: `/pedidos-dropi?c=N`. |
| Servidor del panel | `api/_dropipanel.js` | Lee Dropi, agrupa y calcula. Lo llama `api/dropi.js` (revisa la sesión primero). |
| Ruta | `api/dropi.js` | Si la URL trae `a=data|prov|huella|gest|favs|cuentas|retiros` pasa a `_dropipanel.handle`. |
| Datos guardados | Upstash Redis, hashes `ec:<colección>` (`ec:settings` guarda nombres, directorio, retiros, gestión, favoritos) | Con sufijo por cuenta: `dropiprov`, `dropiprov2`, `dropiprov3`… |

## 2. Cómo funciona una cuenta (país)
- Cada cuenta = un token de **integración** de Dropi en una variable de Vercel:
  `DROPI_TOKEN` (Guatemala), `DROPI_TOKEN_2`, `DROPI_TOKEN_3` (Colombia).
- `api/_dropipanel.js`: `mk(n)` crea el estado de la cuenta (variable del token, base de la API, caché de pedidos, caché de bodegas/teléfonos, favoritos, retiros). `CTAS = {1:mk(1),2:mk(2),3:mk(3)}`.
  Cada petición lleva `?c=N`; `AsyncLocalStorage` hace que `S()` devuelva la cuenta activa, así todo (caché, ajustes) queda separado.
- Base de la API por país: GT `https://api.dropi.gt`, CO `https://api.dropi.co` (se cambia con `DROPI_API_BASE_<n>`).
- Endpoints de Dropi usados (solo rutas `/integrations`, el token no entra en otras):
  `GET /integrations/orders/myorders` (paginado de a 100, hasta 4.000 pedidos) y `POST /integrations/products/index` (catálogo/favoritos).
  Cabecera: `Authorization: Bearer <token>`, y si da 401/403 se prueba `dropi-integration-key`.
- El navegador nunca ve el token. No se guardan datos de clientes: se piden a Dropi en cada consulta.

## 3. Qué calcula `build()` (de los pedidos)
- Grupos de estado (`groupOf`): entregado, devolución, cancelado, novedad, proceso. Estados que cambian por país (ej. CO: "DEVOLUCION EN TRANSITO", "RECHAZADO").
- Por transportadora: total, entregados, devoluciones, efectividad = entregados ÷ finalizados, días promedio, utilidad. **Las transportadoras salen solas del pedido** (`distribution_company.name`); no hay lista fija.
- Utilidad por pedido = `total_order − costo del proveedor − shipping_amount`.
- Pérdida por devoluciones = flete de los pedidos devueltos.
- Por cobrar = total de pedidos en proceso. Zonas por departamento, tendencia diaria, productos, huella del cliente (por teléfono).
- Movimientos de guía: campos `*_movements` de cada transportadora.

## 4. Lo que cambia entre países (checklist)
1. Variable de Vercel `DROPI_TOKEN_<n>` + (si la API es otra) `DROPI_API_BASE_<n>`.
2. `CTAS` y `mk(n)` en `_dropipanel.js`; el selector `{2:2,3:3}[c]` en `handle`.
3. Nombres y "conectada" en `cuentas()` (y su lista `[1,2,3]`).
4. Estados propios del país en `groupOf` (solo si aplica a esa cuenta: `S().n === n`).
5. Panel (`panel-dropi.html`): `CTA` (lee `?c=`), `money()` (símbolo y decimales: GT `Q`, CO `$ … COP`), `waLink()` (prefijo: GT 502, CO 57), texto del subtítulo y de la fuente.
6. Barra de cuentas en `ecompro.html` (`#adm-bar`, script "Admin Dropi"): `N`, `CON`, los `[1,2,3]` y la URL del iframe.
7. README: fila de la variable.

## 5. Dashboard con fuentes (General / Dropi 1 / Dropi 2)
- Script `db-live` al final de `ecompro.html`: barra de fuentes (`#db-srcs`), cada fuente llama `/api/dropi?a=data&c=N` y repinta las tarjetas con datos en vivo: ventas, entregados, devueltos, descuento por devueltos, por cobrar, utilidad.
- La fuente elegida y el periodo se recuerdan en `localStorage` (`ec_dblive`).
- Para otro país: agregar el botón de la fuente, usar `c=<n>` y la moneda del país.

## 6. Dinero / retiros
- `a=retiros` (GET/POST) guarda a mano cada retiro por cuenta: banco, monto, comisión, neta, fecha. Dropi no entrega los retiros por la API de integración, por eso es manual (el intento automático `?auto=1` se muestra solo si Dropi responde).
- Conversión Q/S/ con el interruptor global `window.ecFx` y `rate()`.

## 7. Prompt para pedirle a Claude otro país
> En el repo ECOMPRO ya existe el panel Dropi multi-cuenta (`api/_dropipanel.js`, `private/panel-dropi.html`, barra Admin Dropi en `private/ecompro.html`, ver `docs/PLANTILLA-PANEL-PAIS.md`). Agrega una cuenta nueva para **<PAÍS>**: variable `DROPI_TOKEN_<n>`, base `https://api.dropi.<dominio>`, moneda **<símbolo/código>**, prefijo de WhatsApp **<código>**, estados de devolución propios **<lista>**. Mismas pestañas y funciones que Guatemala, con las transportadoras que traiga Dropi. No toques las otras cuentas. Prueba con datos simulados, haz commit y push a la rama de trabajo, y dime qué variable poner en Vercel.
