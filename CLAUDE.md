
## Caza diaria (regla fija del dueño)
- Cuando el usuario diga "caza diaria" (hunt de productos ganadores): usar SIEMPRE la skill `golden-dropkiller-productos-ganadores` (modo CAZA) con DropKiller, país GT, plataforma Dropi.
- Filtros fijos, sin volver a preguntarlos: antigüedad MÁXIMA 3 meses (90 días, createdAt; descartar el placeholder 2025-10-04), ventas depuradas con `ventas_reales.py`, flete 68, entrega 62 %, utilidad objetivo 30 Q, minSuggestedPrice 149, minSold7d 40, minStock 20, competencia solo Guatemala, 5 productos por día, sin repetir los de los últimos 20 días.
- Guardar por producto `ct` (createdAt) y `tv` (venta total).
