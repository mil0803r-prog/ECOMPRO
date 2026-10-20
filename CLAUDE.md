
## Caza diaria (regla fija del dueño)
- Cuando el usuario diga "caza diaria": usar la skill de proyecto `cazadiaria` (.claude/skills/cazadiaria/SKILL.md), que combina el radar de 7 fases con la skill `golden-dropkiller-productos-ganadores`. Corre MIÉRCOLES y SÁBADO. País GT, plataforma Dropi.
- Filtros fijos, sin volver a preguntarlos: antigüedad MÁXIMA 3 meses (90 días, createdAt) y SOLO productos creados en 2026 (nada de 2025, ni el placeholder 2025-10-04); ventas de 7 días, de 30 días y totales, las tres entre 50 y 800 (depuradas con `ventas_reales.py`); stock >= 80; el precio NO importa; 1 o 2 proveedores del mismo producto; la rentabilidad NO es filtro (la oferta se calcula solo como dato); competencia solo Guatemala; 5 productos por día, sin repetir los de los últimos 20 días.
- Guardar por producto `ct` (createdAt) y `tv` (venta total).
