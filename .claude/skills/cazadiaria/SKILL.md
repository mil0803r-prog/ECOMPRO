---
name: cazadiaria
description: Radar de productos ganadores para ECOMPRO (Dropi Guatemala). Combina el método de la skill golden-dropkiller-productos-ganadores (ventas reales, no crudas) con el radar de 7 fases (cosecha, agrupar por producto, margen, inteligencia de anuncios, puntuación, banderas, informe HTML y memoria entre corridas). Corre miércoles y sábado. Úsala cuando digan "caza diaria", "radar de productos", "dame ganadores".
---

# CAZADIARIA — radar de productos ganadores (Guatemala · Dropi)

Mejora de golden-dropkiller-productos-ganadores: usa sus reglas de ventas reales (descartar ajustes de stock, consolidar espejos) y le suma agrupación de proveedores por producto, inteligencia de anuncios, 5 criterios de puntuación, banderas de riesgo, informe HTML y memoria entre corridas.

## Cuándo corre
Todos los MIÉRCOLES y SÁBADOS, 6:52 a.m. hora de Guatemala (tarea programada). Si el usuario dice "caza diaria" a mano, se corre igual con estas mismas reglas, sin volver a preguntar filtros.

## Herramientas
1. Tareas programadas (la corrida automática). 2. DropKiller por API (bloqueante: sin él no se corre y se escribe un solo documento de aviso con el motivo). 3. Navegador (opcional: si no hay, se corre igual sin verificar en la Biblioteca de Anuncios de Meta y se dice en el informe).

## Configuración fija (del dueño, no se pregunta)
- País GT, plataforma DROPI, solo productos ACTIVOS con stock.
- ANTIGÜEDAD: createdAt de máximo 90 días y SOLO productos creados en 2026. Nunca 2025 ni el placeholder 2025-10-04.
- VENTAS: las TRES entre 50 y 800 (7 días, 30 días y totales), depuradas (sin ajustes de inventario: verificar en get_product_history que haya días de venta consistentes). Stock >= 80. El precio NO importa.
- PROVEEDORES: el mismo producto con 1 o 2 proveedores distintos en Dropi GT; 3 o más se descarta.
- COMPETENCIA: solo Guatemala (anuncios cuyo campo countries sea únicamente GT; fuera quedan los anunciantes extranjeros).
- RENTABILIDAD: NO es filtro. Se calcula solo como dato informativo con valores de referencia (reemplazar por los medidos): flete 68, flete de devolución 30, comisión de recaudo 0 (ya va dentro del flete), entrega 62 %, CPA 20.
- Cantidad: 10 finalistas en el informe; los 5 mejores se guardan como tarjetas de Caza diaria.

## Las 7 fases
1. COSECHA. search_products (country GT, DROPI, ACTIVE, minStock 80, minTotalSold 50, minSold7d 50, sort soldUnitsLast7Days), paginando varias veces. Aplicar leyendo cada fila: createdAt >= hoy-90 días y año 2026, ventas 7d/30d/totales entre 50 y 800. Probar también find_winning_products (trending). Reunir todo lo posible (meta: 120 o más filas leídas); si no alcanzan candidatos, decir cuántos hubo y qué filtro aflojar. Nunca inventar.
2. AGRUPA POR PRODUCTO. El mismo producto aparece con varios proveedores y nombres distintos: normalizar (quitar códigos, cantidades x1 x2 ml gr, y relleno: original, oferta, promo, combo, kit, nuevo) y agrupar por palabras clave. Por grupo: nº de proveedores, ventas 7d y 30d sumadas, stock total, costo mínimo y máximo, precio sugerido mediano. MOSTRAR SIEMPRE los nombres originales juntados. Precios sugeridos de 0 o 1 son basura: ignorar; si ninguno es válido, estimar 2,5 x costo y marcarlo "precio estimado".
3. MARGEN (informativo). utilidad por pedido generado = entrega x (PVP - costo - flete - comisión) - (1 - entrega) x flete_devolución - CPA (el CPA no se multiplica por la entrega). Etiquetar VIABLE (supera Q30), REPRECIABLE (cierra a 2,5 x costo o en pack x2) o NO CIERRA. No descarta: informa. Calcular también la oferta sugerida {u (1 o 2), precio terminado en 9}.
4. INTELIGENCIA DE ANUNCIOS (DropKiller, Meta y TikTok, búsqueda por significado además del nombre). Por producto: tiendas distintas que lo anuncian en GT, anuncios activos y creativos, antigüedad del anuncio más viejo, ángulos de venta en uso (del texto real), ofertas en uso, huecos de audiencia y ángulo. Semáforo de saturación por tiendas en GT: 0 cuidado (quizá ya lo probaron), 1-2 muy buena señal, 3-8 zona dulce, 9-14 apretado (solo con ángulo nuevo), 15 o más saturado. Con más de 6 anunciantes distintos se descarta salvo tracción excepcional. Referentes fuera de GT (CO, MX, PE, EC, CL, AR, PA, CR, DO, BO, PY, UY, SV, HN): hasta 5 tiendas, 5 imágenes y 5 videos del MISMO producto, sin rellenar.
5. PUNTUACIÓN 0 a 3 en 5 criterios (máx 15), con evidencia: (1) resuelve una necesidad, (2) sube el estatus o cambia la emoción, (3) funcionalidad clara de una foto, (4) admite ángulos nuevos, (5) permite oferta ganadora (pack, combo, 2x1). Sacar los 10 mejores. El puntaje de 0 a 100 de la tarjeta = round(puntaje/15 x 100).
6. BANDERAS. Rojo: nombre con marca registrada (Dewalt, Adidas, Nike, Apple, Stanley...): Meta puede tumbar la cuenta. Amarillo: consumibles y cosméticos (gotas, cápsulas, cremas, suplementos): registro sanitario. Nada para adultos ni promesas de cura.
7. INFORME HTML autocontenido, legible en celular: (a) veredicto en dos frases arriba; (b) 10 fichas con nombre, puntaje, margen, ventas 7d y 30d, proveedores con ID de Dropi, costo, precio y stock, tiendas con enlaces a sus landings, ángulos YA en uso, MÍNIMO 5 ÁNGULOS NUEVOS (audiencia + gancho), banderas; (c) tabla completa con los nombres originales agrupados; (d) sección "A REVISAR". Publicarlo como Artifact privado si la herramienta existe y dar el enlace; si no, guardarlo y decirlo.

## Memoria entre corridas
Colección de la base del tablero `radar` (ArtifactData), un documento por producto: {nombre, fecha, v7, v30, veredicto}. Reglas: un producto ya evaluado NO se repite en 21 días. EXCEPCIÓN GEMA: 3 corridas seguidas con ventas estables (variación < 15 %) vuelve marcado "A REVISAR". EXCEPCIÓN DESPEGUE: un descartado que DUPLICA sus ventas vuelve marcado "DESPEGANDO". Además no repetir nombres de la colección `winners` de los últimos 20 días.

## Salida al tablero
Tablero: https://claude.ai/artifact/74zR7TjeHzMgxQ7kT3aqX8. Colección `winners`, documentos `AAAA-MM-DD_N` (N 1 a 5, fecha de hoy en Guatemala), ArtifactData batch op set, EXACTAMENTE: date, rank, source "ia", name, provider, verificado, cats, costo, pvp, v7, v30, stock, score (0-100), scores {demanda, traccion, margen, competencia, riesgo} (enteros 0-10), oferta {u, precio}, verdict, angle, competition, anWA, anLand, anTotal, anNota, tiendas [{url,adv,pais,dias,nota}], imgs y vids [{adv,pais,dias,score,ver,dk,nota}] (ver = https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=<externalId>, dk = https://app.dropkiller.com/dashboard/ads/<id>), provs [{prov,id,nombre,costo,stock,v7,v30,tv,ct,alt}], foto, risk, dropi, dk, ct (createdAt AAAA-MM-DD), tv (ventas totales), status "nuevo", fav false. Español, sin emojis, sin inventar cifras. Al final releer `winners` y confirmar.

## Si algo falla
Guardar avance producto por producto. Si se cae, entregar lo logrado, qué faltó y por qué. Nunca un informe vacío sin explicación. Si DropKiller falla: un solo documento `winners/AAAA-MM-DD_aviso` {date, source:"ia", rank:99, name:"No se pudo cazar hoy", verdict: motivo}. Si hay menos de 5, guardar los que cumplan, decir cuántos fueron y qué filtro cortó más.

No uses datos personales de compradores. No publiques ni modifiques la página del tablero, no envíes mensajes ni toques campañas.
