# Plan de rediseño UI/UX — "Mis Metas de Ahorro"

Dirección elegida: **Híbrido A+B** (dashboard financiero con acentos motivacionales).
Alcance: **reestructura completa** (nuevo layout, jerarquía y componentes; se conserva el stack: Next 15, tokens CSS, framer-motion, recharts, tipografías).

## Objetivo de diseño

Una app personal de ahorro que en la primera pantalla responda tres preguntas sin scroll:
1. **¿Cuánto tengo?** (saldo total, por cobrar)
2. **¿Voy bien este mes?** (ahorro del mes vs meta, racha)
3. **¿A dónde va mi dinero?** (reparto entre metas + progreso de cada una)

Principios: jerarquía clara (vistazo → detalle), progressive disclosure en las tarjetas, gancho motivacional (racha, hitos, celebración), paridad light/dark, accesibilidad y responsive real.

## Nueva estructura (top → bottom)

```
Topbar                → marca + toggle tema
Banda Resumen         → fila de 4 KPIs (saldo · este mes · por cobrar · racha)
                        + progreso global hacia todas las metas
Reparto mensual       → dona: dónde va tu ahorro mensual entre metas
Tendencia             → gráfico de barras mensual (ampliado) + línea de meta
Metas                 → tarjetas compactas con anillo de progreso, fecha
                        proyectada e hitos; detalle (movimientos/agregar) al expandir
Deudas                → widget integrado, mismo lenguaje visual
```

## Dependencias entre tickets

```
T1 (tokens) ─┬─ T2 (shell) ─┬─ T3 KPIs
             │              ├─ T4 Resumen/progreso
             │              ├─ T5 Dona reparto
             │              ├─ T6 Tendencia
             │              ├─ T7 GoalCard
             │              └─ T8 Deudas
             └────────────────── T9 (motion) ─ T10 (a11y/responsive/build)
```
T1 y T2 son bloqueantes. T3–T8 se pueden ejecutar en cualquier orden tras T2. T9 y T10 cierran.

---

## T1 — Fundamentos: tokens de diseño

**Scope:** Extender el sistema de tokens antes de tocar layout. No cambia comportamiento visible aún.

- Escala de espaciado (`--sp-1`…`--sp-8`), radios (`--r-sm/md/lg/pill`), elevación (`--e-1/2/3`) y tokens de motion (`--ease`, `--dur-fast/base`).
- Paleta de charts para la dona (4–6 colores derivados de `--brand`/`--gold` con contraste suficiente en ambos temas). Documentar cuál color va a cada índice de meta.
- Token `--positive` explícito (hoy `--brand` cumple doble rol) y `--neutral` para estados sin meta.
- Mantener `:root` (light), `:root[data-theme="dark"]` y `@media (prefers-color-scheme: dark)` en sincronía — los tres bloques.

**Archivos:** `src/app/globals.css`.

**Aceptación:** `npm run build` OK; temas light/dark sin regresión visual; nuevos tokens usados por ≥1 componente en tickets siguientes.

---

## T2 — Shell de layout y grid responsive

**Scope:** Reestructurar `page.tsx` en secciones semánticas (`<section>` con encabezados) siguiendo la nueva estructura. Contenedor con grid responsive (1 col móvil → multi-col desktop). Sin perder ninguna funcionalidad ni llamada a server actions existente.

- Envolver secciones: Resumen, Reparto, Tendencia, Metas, Deudas.
- Grid de 12 columnas (o CSS grid con áreas) para colocar Reparto + Tendencia lado a lado en desktop y apilados en móvil.
- Conservar todo el estado y handlers actuales de `page.tsx` intactos; solo cambia el árbol JSX y el CSS de layout.

**Archivos:** `src/app/page.tsx`, `src/app/savings.css`.

**Aceptación:** Todas las acciones (crear/editar/eliminar meta, movimientos, tasa, deudas) siguen funcionando; layout se reordena correctamente en móvil/desktop; `npx tsc --noEmit` limpio.

---

## T3 — Fila de KPIs

**Scope:** Nuevo componente `StatTile` + banda de 4 KPIs.

- Tiles: **Saldo total**, **Ahorrado este mes** (con sub "de S/ meta · faltan S/ X"), **Por cobrar**, **Racha** (🔥 N meses).
- Números en IBM Plex Mono, tabular. Cada tile con etiqueta uppercase muted + valor grande.
- Estados: si `totalReceivable === 0` u otros vacíos, degradar con elegancia (mostrar guion o placeholder, no ocultar saltando el grid).
- Reutiliza cálculos ya presentes en `page.tsx` (`totalCurrentAll`, `currentMonthTotal`, `streak`, `totalReceivable`).

**Archivos:** `src/components/StatTile.tsx` (nuevo), `src/app/page.tsx`, `src/app/savings.css`.

**Aceptación:** 4 KPIs visibles con datos reales; racha solo destaca si ≥2; responsive (2×2 en móvil, 4×1 en desktop).

---

## T4 — Resumen: progreso global y control de tasa

**Scope:** Rehacer el hero como banda de progreso global limpia, separando conceptos que hoy están apretados.

- Visual de progreso global hacia todas las metas (anillo o barra refinada) con `%` claro y "S/ actual de S/ objetivo".
- Estado motivacional: mensaje según mes cumplido / atrasado.
- Reubicar edición de **ahorro mensual** a un control propio y legible (no en caption mono pequeño). Mantener la lógica de persistencia doble (localStorage + `updateMonthlyRate`) tal cual — solo cambia UI del control.

**Archivos:** `src/app/page.tsx`, `src/app/savings.css`.

**Aceptación:** Editar la tasa persiste igual que hoy (localStorage + server, solo en cambio explícito); progreso global correcto; sin regresión en `overallPct`.

---

## T5 — Dona de reparto mensual

**Scope:** Nuevo componente `AllocationDonut` (recharts `PieChart`) que muestra cómo se reparte el ahorro mensual entre metas según `allocationPct`.

- Segmentos por meta con la paleta de charts de T1; leyenda con nombre + %.
- Centro de la dona: "Ahorro mensual S/ X".
- Estados borde: sin metas → estado vacío; asignación total ≠ 100% → mostrar remanente/exceso (coherente con las advertencias ya existentes de allocation en GoalCard).
- Solo lectura; no muta `allocationPct` (eso sigue en GoalCard).

**Archivos:** `src/components/AllocationDonut.tsx` (nuevo), `src/app/page.tsx`, `src/app/savings.css`.

**Aceptación:** Dona refleja `allocationPct` reales; colores con contraste en light/dark; casos 0 metas y suma≠100% manejados sin romper.

---

## T6 — Tendencia mensual (rework del gráfico)

**Scope:** Ampliar y pulir el `BarChart` mensual actual.

- Más historia visible (hasta 12 meses si hay datos; degradar si hay menos), barras más legibles, altura mayor.
- Línea de referencia de meta mensual y color de barra según cumplió/no cumplió.
- Tooltip refinado (reusar `MonthlyTooltip`, ajustar estilo a tokens nuevos).

**Archivos:** `src/app/page.tsx`, `src/app/savings.css`.

**Aceptación:** Gráfico legible en móvil y desktop; línea de meta visible; sin errores de recharts en consola.

---

## T7 — Rediseño de GoalCard (progressive disclosure)

**Scope:** Rehacer `GoalCard` en dos capas: resumen compacto siempre visible + detalle al expandir.

- **Compacto:** ícono/nombre, anillo o barra de progreso, monto actual/objetivo, **fecha proyectada de finalización** (usa `portfolioCompletionLabel`) y % asignado como chip.
- **Hitos:** marcadores 25/50/75/100% en la barra/anillo.
- **Detalle (expandido):** form de agregar movimiento, historial paginado, edición de objetivo y asignación — toda la funcionalidad actual, reorganizada.
- **Celebración:** al completar, badge + micro-animación (respetar `prefers-reduced-motion`).
- Mantener todas las props/handlers actuales de `GoalCard`; es reorganización visual, no cambio de contrato de datos.

**Archivos:** `src/components/GoalCard.tsx`, `src/app/savings.css`.

**Aceptación:** Todas las acciones por meta funcionan (agregar/editar/eliminar movimiento, editar objetivo, asignación, cargar más, simulación); estado completado se celebra; carga cognitiva reducida (detalle oculto por defecto).

---

## T8 — Integración visual de Deudas

**Scope:** Restilizar `DebtsSection` (`.dbt-*`) al nuevo lenguaje visual para que no se sienta desconectada.

- Encabezado de sección consistente con las demás; total por cobrar destacado.
- Tarjetas de deuda con el mismo tratamiento de superficie/elevación/tipografía.
- Opcional: colapsable, ya que es informativa (money owed *to* the user) — no integrarla en la matemática de ahorro (mantener la separación deliberada documentada en CLAUDE.md).

**Archivos:** `src/components/DebtsSection.tsx`, `src/app/savings.css` o estilos `.dbt-*`.

**Aceptación:** Deudas visualmente coherentes con el resto; simulación "¿y si me pagan?" sigue funcionando; no toca `currentAmount` ni balance.

---

## T9 — Micro-interacciones y motion

**Scope:** Pulido de animación con framer-motion.

- Enter/exit de tarjetas y secciones, expand/collapse suave, barras/anillos animados, count-up opcional en KPIs, celebración de meta completada.
- Todo debe degradar con `@media (prefers-reduced-motion: reduce)`.

**Archivos:** `src/app/page.tsx`, `src/components/*`, `src/app/savings.css`.

**Aceptación:** Animaciones fluidas; con reduced-motion activo no hay movimiento; sin jank en móvil.

---

## T10 — Pasada de responsive, accesibilidad y build

**Scope:** Cierre de calidad.

- Verificar layout en breakpoints (móvil/tablet/desktop); grid, KPIs y dona/tendencia se reordenan bien.
- A11y: focus-visible en todo control nuevo, `aria-label`/roles en charts y dona, contraste AA en light/dark.
- Correr: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Revisar consola del navegador sin errores.

**Archivos:** transversal.

**Aceptación:** tsc + lint + build limpios; sin errores de consola; navegación por teclado completa; contraste verificado en ambos temas.

---

## Notas de conservación (no romper)

- **Sin DB:** persistencia sigue en `data/db.json` vía server actions; el rediseño es solo cliente/estilos.
- **Tasa mensual:** doble persistencia (localStorage + store) solo en cambio explícito — no escribir en montaje.
- **Deudas:** informativas, desacopladas de la matemática de ahorro.
- **Formato:** `formatSoles` en `page.tsx` sigue siendo el único formateador; no introducir `src/lib/utils.ts`.
- **Tema:** mantener `themeScript` de `layout.tsx` en sincronía con `ThemeToggle`.
- **Sin librería de componentes** nueva sin discutirlo; seguir con `<style>`/CSS por tokens.
