---
name: cazadiaria2
description: CAZADIARIA 2 — Radar diario de productos ganadores para ECOMPRO (Dropi Guatemala), en 7 fases literales (cosecha validado y emergente, agrupar por producto, filtro de margen, inteligencia de anuncios, puntuación, banderas de riesgo, informe) con memoria entre corridas. Úsala cuando digan "cazadiaria 2", "radar diario" o "radar de productos ganadores".
---

# CAZADIARIA 2 — RADAR DIARIO DE PRODUCTOS GANADORES (Guatemala · Dropi)

Se ejecuta TAL CUAL, cada fase y cada regla, sin omitir nada. Es independiente de la skill `cazadiaria` (la caza de miércoles y sábado, con sus filtros fijos).

## Paso 1 — Herramientas (verificar y decir claramente cuáles hay)
1. Tareas programadas (para que corra solo cada día).
2. DropKiller conectado por API (búsqueda de productos y de anuncios). Si falta: DETENERSE y explicar que sin el acceso por API de DropKiller el radar no puede funcionar y qué hacer para conectarlo (conectar el conector de DropKiller en la rutina). No seguir hasta que lo tenga; en una corrida automática, escribir solo el documento de aviso con el motivo.
3. Extensión de navegador de Claude (abrir y leer páginas). Si falta: avisar que el radar corre igual pero sin la verificación en la Biblioteca de Anuncios de Meta (y sin leer Amazon), y decirlo en el informe.

## Paso 2 — Configuración (preguntar y esperar; ya respondida)
A) País: Guatemala (GT), plataforma DROPI. (Una tarea = un país; varios países = varias tareas.)
B) Hora del informe: 9:00 a.m. hora de Guatemala (la tarea corre un poco antes para tener el informe listo).
C) Números de operación (valores de referencia; el dueño debe reemplazarlos por los suyos apenas los tenga medidos, porque de estos cinco números depende todo el filtro de rentabilidad): lee `settings/radar2` de la base del tablero {flete, devol, comision, entrega, cpa, viable}; si no existe usa: flete por entrega Q35, flete de devolución Q28, comisión de recaudo contra entrega 4 %, tasa de entrega efectiva 65 %, CPA objetivo por pedido generado Q20, umbral VIABLE Q8 por pedido. (El dueño escribió "35.000" y "8.000" copiando una plantilla colombiana: se interpretan en miles, Q35 y Q8; dejarlo dicho en la nota del informe.) Advertir siempre en el informe que son valores de referencia.

## Paso 3 — Las siete fases de cada corrida

### FASE 1 · COSECHA
Buscar en DropKiller (search_products), filtrando por MI PAÍS (GT) y plataforma DROPI, solo productos ACTIVOS y con stock disponible. Dos búsquedas:
- BÚSQUEDA A — "VALIDADO" (ya demostró que se vende): entre 81 y 200 unidades vendidas en los últimos 7 días, por proveedor.
- BÚSQUEDA B — "EMERGENTE" (apenas despegando): entre 20 y 80 unidades en los últimos 7 días, por proveedor, y máximo 320 unidades en los últimos 30 días.
Traer al menos 120 productos de cada búsqueda (paginar con el cursor; si no se llega, decir cuántos fueron y qué filtro aflojar).

### FASE 2 · AGRUPA POR PRODUCTO
Lo más importante y lo que casi nadie hace. El mismo producto aparece varias veces porque lo venden varios proveedores con nombres distintos; si solo se mira uno, se subestima la demanda real Y la competencia. Agrupar los que son el mismo normalizando el nombre: quitar códigos de referencia, cantidades (x1, x2, ml, gr) y palabras de relleno (original, oferta, promo, combo, kit, nuevo); agrupar los que comparten las palabras clave del nombre. Por cada grupo calcular: cuántos proveedores lo tienen, ventas sumadas de 7 y 30 días, stock total, costo más bajo y más alto, y precio sugerido mediano. IMPORTANTE: en el informe mostrar SIEMPRE qué nombres originales se juntaron en cada grupo, para poder revisar si hubo error. PRECIOS SUCIOS: DropKiller a veces trae precios sugeridos de $1 o $0 (datos basura): ignorarlos al calcular la mediana. Si ningún proveedor tiene precio válido, estimar 2,5 veces el costo y MARCARLO como precio estimado en el informe.

### FASE 3 · FILTRO DE MARGEN
Antes de investigar anuncios, descartar lo que no deja plata (investigar anuncios toma tiempo y no vale la pena en un producto que pierde dinero). Por cada grupo, con los números de la configuración:
utilidad por pedido generado = tasa_entrega × (PVP − costo − flete − comisión) − (1 − tasa_entrega) × flete_devolución − CPA
(la comisión es el % de recaudo sobre el PVP). El CPA NO se multiplica por la tasa de entrega: la publicidad se paga por pedido generado, se entregue o no. Clasificar cada grupo:
- VIABLE → la utilidad supera el umbral (Q8) por pedido.
- REPRECIABLE → no cierra al precio sugerido, pero SÍ cierra vendiéndolo a 2,5 veces el costo o en pack x2.
- DESCARTADO → no cierra ni así.
Los REPRECIABLE no se botan: son oportunidades que necesitan el precio del dueño, no el que sugiere el proveedor. Solo VIABLE y REPRECIABLE pasan a la fase 4.

### FASE 4 · INTELIGENCIA DE ANUNCIOS
Sobre los que sobrevivieron, usar la biblioteca de anuncios de DropKiller (cubre Meta y TikTok; search_ads y semantic_search_ads, country GT, ACTIVE, paginando) y buscar por significado, no solo por nombre exacto: cada tienda bautiza el producto distinto. Por producto averiguar: cuántas TIENDAS distintas lo anuncian; cuántos anuncios activos y cuántos creativos; hace cuánto corre el anuncio más antiguo (si lleva meses activo, a alguien le funciona); qué ÁNGULOS DE VENTA usan, sacados del texto real; qué OFERTAS usan (2x1, packs, precios, contra entrega); qué HUECOS quedan: audiencias y ángulos que nadie toca. COBERTURA TOTAL (obligatoria): la fase 4 y la 5 se hacen para TODOS los grupos VIABLE y REPRECIABLE, sin excepción. Para que quepan, repartir los grupos en lotes de unos 20 y analizarlos con varios agentes en paralelo (herramienta Agent / subagentes), cada uno con este protocolo fijo por grupo: (a) una búsqueda por significado (semantic_search_ads, GT, ACTIVE) y (b) una búsqueda de texto (search_ads con el nombre normalizado y, si hace falta, un nombre original), paginando; contar solo anuncios con countries únicamente GT y de ese mismo producto. Cada agente escribe su avance cada ~5 grupos y devuelve cuántos analizó de cuántos. NO entregar el informe mientras falten grupos: reintentar los que fallaron. Si al final alguno no se pudo, decirlo con el número exacto y el motivo (el tablero muestra "Fase 4: X de Y analizados"), y los no analizados NUNCA entran al top 10. El top 10 se calcula con todos puntuados.

Semáforo de saturación por tiendas: 0 = cuidado, quizá ya lo probaron y no funcionó; 1 a 2 = muy buena señal; 3 a 8 = zona dulce, aquí se quiere estar; 9 a 14 = apretado, solo con ángulo nuevo; 15 o más = saturado, solo con mejor oferta.

### FASE 5 · PUNTUACIÓN
Puntuar cada producto de 0 a 3 en cada criterio (15 máximo), apoyado en la evidencia recogida, no en opinión: (1) RESUELVE UNA NECESIDAD (antes y después claro); (2) SUBE EL ESTATUS O CAMBIA LA EMOCIÓN de quien compra; (3) FUNCIONALIDAD CLARA (se entiende de una foto, sin explicación); (4) ADMITE ÁNGULOS NUEVOS (quedan ángulos sin explotar); (5) PERMITE OFERTA GANADORA (se puede armar pack, combo o 2x1). Un producto con puntaje alto que falló la Fase 3 NO entra: el margen no se compensa con encanto. Sacar los 10 mejores por puntaje.

### FASE 6 · BANDERAS DE RIESGO
Rojo: cualquier producto cuyo nombre contenga una MARCA REGISTRADA (Dewalt, Adidas, Nike, Apple, Stanley, etc.): Meta puede tumbar la cuenta publicitaria completa. Amarillo: consumibles y cosméticos (gotas, cápsulas, cremas, suplementos): necesitan registro sanitario.

### FASE 7 · INFORME
Generar un ARCHIVO HTML al final de cada corrida, autocontenido, que se vea bien en el celular (publicarlo como Artifact privado si la herramienta existe y dar el enlace; guardar el archivo y mostrarlo al terminar), con: (1) VEREDICTO EN DOS FRASES arriba de todo: qué mirar hoy y por qué (nada de abrir con una tabla gigante); (2) LOS 10 FINALISTAS, una ficha cada uno: nombre, puntaje, veredicto de margen, ventas 7d y 30d, proveedores con su ID de Dropi, costo, precio y stock, tiendas que lo anuncian con enlaces a sus landings, ángulos que YA están en uso, MÍNIMO 5 ÁNGULOS NUEVOS que nadie usa (cada uno con su audiencia y su gancho), banderas de riesgo; (3) TABLA COMPLETA de todos los productos evaluados, con los nombres originales agrupados en cada uno; (4) sección "A REVISAR": productos de días anteriores que siguen estables o que dispararon sus ventas. Además, por cada finalista, enlaces de validación: Amazon `https://www.amazon.com/s?k=<producto>` y AliExpress `https://www.aliexpress.com/wholesale?SearchText=<producto>` (el tablero ya los agrega).

## Memoria entre corridas
Guardar un registro de cada producto evaluado con su fecha, ventas y veredicto: colección `radar2_mem` de la base del tablero (un documento por grupo: {nombre, fecha, v7, v30, veredicto}). Reglas: un producto ya evaluado NO se repite en 21 días. EXCEPCIÓN GEMA: si lleva 3 días seguidos con ventas estables (variación menor al 15 %), vuelve marcado "A REVISAR — lo evaluamos hace unos días, su promedio se mantiene, échale un vistazo ahora". EXCEPCIÓN DESPEGUE: si un producto descartado DUPLICA sus ventas, vuelve inmediatamente marcado "DESPEGANDO".

## Salida a la plataforma (sección CAZADIARIA 2)
Escribir UN documento en la colección `radar2`, id `AAAA-MM-DD` (hoy en Guatemala), con ArtifactData set, que el tablero muestra en Investigación de mercado > CAZADIARIA 2:
{date, source:"ia", titulo, sub, veredicto (dos frases), nota (límites de la corrida y la interpretación de Q35/Q8), busqueda:{A:{leidos,grupos}, B:{leidos,grupos}}, config:{flete,devol,comision,entrega,cpa,viable}, fichas:[10], grupos:[todos los evaluados], resumen (cuántos hubo por fase y qué filtro aflojar), revisar (texto de A REVISAR)}.
Ficha: {n, nombre, tags:[{t,c}] (c: am amarilla, ro roja o DESCARTADO, ok, gr), foto (https), v (veredicto de margen y por qué, con cifras), kv:[[etiqueta,valor]] (Ventas 7d, 30d, Stock, Costo, PVP sug., Proveedores, Puntaje), secs:[{h, y uno de: p | ul:[{t,l:[{t,u}]}] | ol:[{b,s}] | rows:[[...]]}] con "Puntaje", "Margen", "Nombres originales agrupados", "Proveedores en Dropi" (rows: Proveedor, ID, Nombre, Costo, Stock, 7d/30d), "Tiendas que lo anuncian: N · semáforo" (ul con enlaces), "Anuncios activos y creativos", "Angulos ya en uso", "Ofertas en uso", "Huecos", "5 angulos nuevos (audiencia y gancho)" (ol: audiencia en b, gancho en s; mínimo 5), "Riesgos"; links:[{t,u}] (Ver en Dropi, Ver en DropKiller)}.
Grupo: {n, prov, v7, v30, stock, cmin, cmax, pvp, est (true si precio estimado), nombres:["nombre original · ID · proveedor"], u (utilidad en Q), clase (VIABLE|REPRECIABLE|DESCARTADO), busq (A|B), fin (true si finalista), pts}. Solo URLs https. Al final releer `radar2` y confirmar.

## Si algo falla
Guardar el avance producto por producto. Si algo se cae a mitad de camino, entregar lo logrado y decir qué faltó y por qué. Nunca entregar un informe vacío sin explicación. Si no hay suficientes productos, entregar los que haya, decir cuántos fueron y sugerir qué filtro aflojar. NUNCA inventar productos ni datos para llenar el informe. Si DropKiller falla: un solo documento `radar2/AAAA-MM-DD` con {date, source:"ia", titulo:"No se pudo cazar hoy", veredicto: motivo, fichas:[], grupos:[]}.

No usar datos personales de compradores. No publicar ni modificar la página del tablero, no enviar mensajes ni tocar campañas.
