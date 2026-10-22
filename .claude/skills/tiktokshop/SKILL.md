---
name: tiktokshop
description: Radar de productos ganadores desde TikTok Shop EE. UU. (DropKiller) cruzado contra Dropi Guatemala. Busca productos ya validados en EE. UU. (300 a 10,000 unidades) que casi no existen en Dropi GT (máximo 3 proveedores) para importar, maquilar o testear. Úsala cuando digan "tiktok shop", "investigación tiktok shop", "joyas ocultas", "productos validados en EE. UU.".
---

# TIKTOKSHOP: productos validados en EE. UU. que faltan en Dropi Guatemala

Método aparte de `cazadiaria`. Aquí la señal de venta viene de TikTok Shop EE. UU. y se cruza con la oferta de Dropi GT. Origen: método enseñado por el dueño (función TikTok Shop de DropKiller).

## Configuración fija (del dueño, no se pregunta)
- Fuente: TikTok Shop EE. UU. por DropKiller. Destino: Guatemala. Cruce regional: SOLO Dropi (no DropLatam ni Chipi).
- No se busca por nombre: se filtra por categoría y por unidades vendidas.
- Unidades vendidas (salesVolume): mínimo 300, máximo 10,000. Fuera de esa banda queda saturado o sin validar.
- Señales de demanda: facturación en USD (la principal), unidades, rating y precio.
- Proveedores del mismo producto en Dropi GT: máximo 3. Con 0 es oportunidad de importación o maquila propia.
- Pendientes que el dueño aún no fijó (usar estos por defecto y decirlo): categorías todas (ver nota de Salud), rating >= 4.0, sin mínimo de facturación (se usa para ordenar), sin límite de antigüedad, 5 productos por corrida sin repetir los de corridas anteriores.

## Cómo se ejecuta con las herramientas de DropKiller
1. `list_tiktok_categories` para obtener el id de la categoría (ej. Health = 700645).
2. `search_tiktok_products` con `categoryId`, `sort: salesVolume`, `limit: 100`. La herramienta NO filtra por unidades: la lista viene de mayor a menor venta total, así que hay que paginar hasta caer en la banda 300-10,000 y filtrar leyendo cada fila.
   - Las respuestas pesan más de 1 MB por página (traen embeddings): se guardan en un archivo y se procesan con Python (`python3 -I`), nunca se leen enteras.
   - Medido en Health (5,380 productos activos): página 1 ≈ 2,892 a 1,173 unidades; página 5 ≈ 910 a 840; página 10 ≈ 625 a 578; página 15 ≈ 425 a 392; página 20 ≈ 287 a 262. La banda útil va de la página 0 (ahí está el techo de 10,000) hasta la 19, unos 1,900 productos.
   - Campos útiles por fila: title, currentPrice, salesVolume (total), rating, reviewCount, sellerName, billing30d y soldUnits30d (vienen nulos en muchos), firstSeenAt, imageUrls, productUrl, appUrl.
   - Facturación estimada = currentPrice x salesVolume (no es dato medido: decirlo).
3. Cruce con Dropi GT, por cada candidato: `semantic_search_products` o `search_products` (countryCode GT, platformType DROPI, status ACTIVE) con el nombre traducido al español y palabras clave. Contar proveedores distintos del mismo producto. 0 a 3 pasa; 4 o más se descarta. Nunca dar por "no existe" sin haber buscado con al menos dos variantes del nombre.
4. Anuncios: `list_tiktok_product_ads` para ver creativos del producto; y búsqueda por imagen/significado en anuncios de GT para saber si ya lo pautan.
5. Margen informativo (no filtra), con las mismas referencias de `cazadiaria` si hay costo en Dropi; si es importación, decir que falta costo de origen.

## Banderas
- Rojo: marca registrada en el nombre (GNC, Nutrafol, MaryRuth's, etc.): no se puede copiar el nombre ni la marca.
- Amarillo: suplementos, cosméticos y consumibles (registro sanitario en Guatemala). La categoría Health de TikTok Shop es casi toda suplementos: priorizar dispositivos y accesorios de salud (tensiómetros, masajeadores, correctores) o probar otras categorías.
- Nada para adultos ni promesas de cura.
- Los "bundles" y "packs" de marca inflan la facturación: agrupar variantes del mismo producto antes de puntuar.

## Salida
Lista de 5 productos con: nombre en inglés y en español, foto, enlace TikTok Shop, precio USD, unidades, facturación estimada, rating, vendedor, proveedores encontrados en Dropi GT (con ID), ruta recomendada (proveedor local, importación o maquila), banderas, y ángulos de anuncio observados. Si no hay 5, decir cuántos hubo y qué filtro cortó más. Nunca inventar cifras.

## Memoria
Guardar por producto: productId de TikTok Shop, nombre, fecha, unidades y veredicto. No repetir un producto evaluado en los últimos 20 días.

No uses datos personales de compradores. No publiques ni toques campañas.
