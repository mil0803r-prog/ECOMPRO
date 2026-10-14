
## Caza diaria (regla fija del dueño)
- Cuando el usuario diga "caza diaria": usar la skill de proyecto `cazadiaria` (.claude/skills/cazadiaria/SKILL.md), que combina el radar de 7 fases con la skill `golden-dropkiller-productos-ganadores`. Corre MIÉRCOLES y SÁBADO. País GT, plataforma Dropi.
- Filtros fijos, sin volver a preguntarlos: antigüedad MÁXIMA 3 meses (90 días, createdAt) y SOLO productos creados en 2026 (nada de 2025, ni el placeholder 2025-10-04); ventas de 7 días, de 30 días y totales, las tres entre 50 y 800 (depuradas con `ventas_reales.py`); stock >= 80; el precio NO importa; 1 o 2 proveedores del mismo producto; la rentabilidad NO es filtro (la oferta se calcula solo como dato); competencia solo Guatemala; 5 productos por día, sin repetir los de los últimos 20 días.
- Guardar por producto `ct` (createdAt) y `tv` (venta total).

## CAZADIARIA 2 (sección aparte, tal cual la instrucción del dueño)
- Skill de proyecto `cazadiaria2` (.claude/skills/cazadiaria2/SKILL.md): radar diario de 7 fases literales (búsqueda A validado 81-200 en 7 d, B emergente 20-80 en 7 d y máx. 320 en 30 d, mínimo 120 de cada una; agrupar por producto; margen VIABLE/REPRECIABLE/DESCARTADO; anuncios con semáforo; 5 criterios 0-3; banderas; informe HTML; memoria). Independiente de `cazadiaria` (miércoles y sábado).
- En la plataforma: Investigación de mercado > CAZADIARIA 2 (colección `radar2`, números en `settings/radar2`).
