# Reporte de Mejoras — Mis Metas de Ahorro

Auditoría inicial + registro de lo implementado desde entonces. Sección final: análisis de lo que queda pendiente.

## Resumen del sistema

App Next.js 15 (App Router), metas de ahorro personal, un solo usuario, sin auth, persistencia en JSON plano. Frontend en `src/app/page.tsx` + componentes en `src/components/` (`GoalCard`, `DeleteConfirmModal`, `Toast`, `Skeleton`). Backend = Server Actions en `src/features/goals/actions.ts` + store en `src/lib/db/store.ts`. Proyecciones centralizadas en `src/lib/projection.ts`.

---

## ✅ Ya implementado

### Código
- Refactor de `page.tsx` (era 1025 líneas monolíticas) → extraído `GoalCard.tsx`, `DeleteConfirmModal.tsx`, `Toast.tsx`, `Skeleton.tsx`.
- Confirmación antes de borrar meta o movimiento (`DeleteConfirmModal` generalizado con `DeleteTarget` union).
- Eliminadas dependencias muertas: `clsx`, `tailwind-merge`, `react-hook-form`.
- Eliminado `src/lib/utils.ts` (función `formatCurrency` duplicada y sin uso — archivo quedó vacío, borrado).
- Error de `getMonthlySummary` ya no se traga en silencio.
- `isLoading`/`loaded` reflejan la carga real de datos (antes se activaba antes de tiempo).
- Fuente de Google migrada de `@import` en CSS a `next/font/google` (no bloquea render).
- `monthlyRate` ahora vive server-side en `db.json` (antes solo en `localStorage`, no sincronizaba entre dispositivos). Actions: `getMonthlyRate()`/`updateMonthlyRate()`.
- Lógica de proyección centralizada en `src/lib/projection.ts` (antes duplicada entre `page.tsx` y `GoalCard.tsx`).
- `computeIsCompleted()` extraído como helper compartido en `actions.ts`.

### Features
- Editar/eliminar un movimiento individual (`updateMovement`/`deleteMovement`), recalcula `currentAmount`/`isCompleted` siempre.
- Historial paginado: 10 movimientos iniciales, "Cargar más" de 10 en 10 (`getMovements(goalId, offset, limit)`).
- Fecha objetivo (`targetDate`) expuesta en UI: opcional al crear meta, editable después (combinada con el monto objetivo).
- Proyección consciente de la fecha objetivo: si existe, muestra "Vas al día" o "Vas atrasado — necesitas ~S/X/mes" comparando el ritmo actual contra lo requerido.

### UI/UX
- Landmarks semánticos (`<main>` en vez de `<div>`).
- `aria-label` en botón "Eliminar" incluye el nombre de la meta/movimiento.
- Toast convertido a `<button>` real, accesible por teclado, con ícono de cerrar.
- Estado vacío ("Aún no tienes metas creadas").
- Gráfico de barras con `aria-label` descriptivo.
- Contraste del monto de balance mejorado (`#FFD700` en vez de `#E8C468`) para WCAG AA.
- Skeleton loading mientras cargan los datos iniciales.

---

## ⚠️ Pendiente — limpieza menor, no bloqueante

| Hallazgo | Estado |
|---|---|
| `dev.db` en la raíz del repo | ⚠️ Sigue bloqueado por un proceso externo (no node, no Docker — probablemente OneDrive, antivirus, o un handle huérfano). Se intentó borrar y renombrar, ambos fallaron con "en uso por otro proceso". Ya está en `.gitignore`, no es riesgo real. Borrar manualmente cuando encuentres qué lo tiene abierto (reiniciar la sesión suele bastar). |
| Tema Tailwind sin usar (`brand`, `surface`, `ink`, `glass`, `boxShadow`, `borderRadius` en `tailwind.config.ts`) | ✅ Eliminado. Quedó solo `fontFamily.sans` (la única extensión realmente usada vía la clase `font-sans` en `layout.tsx`). |
| Al editar/borrar un movimiento paginado se resetaban las páginas "cargar más" | ✅ Arreglado. `loadData()` ahora recuerda cuántas páginas extra tenía cada meta (`movementPagesRef`) y las vuelve a pedir tras cada recarga, así el historial visible no colapsa después de editar o borrar un movimiento. |
| Valores hardcodeados (rate default 1421, ícono default ⭐, montos rápidos [100, 500, rate]) | Documentado, aceptable para single-user, cambiar si se generaliza la app. |

---

## 🔍 Análisis: qué falta ahora

Con las 3 prioridades altas del reporte original resueltas, esto es lo que queda por tipo de impacto:

### Arquitectura (deuda real, no urgente)
- **Sin tests, sin CI** (`.github/workflows` no existe, sin Jest/Vitest/Playwright). Cero red de seguridad para regresiones — cada cambio se valida solo por `npm run build` + prueba manual. Si el proyecto va a seguir creciendo, esto es lo primero que da retorno: tests para `actions.ts` (la lógica de recálculo de `currentAmount`/`isCompleted` es exactamente el tipo de código que se rompe silenciosamente).
- **Sin ESLint config committeada** pese a que `next lint` está en `package.json` — corre con defaults de Next, sin reglas propias.
- **JSON plano como "base de datos"**: reescribe el archivo completo en cada mutación. Bien para el volumen actual; con años de movimientos por meta esto empieza a doler (aunque la paginación nueva ya mitiga el costo de lectura en el cliente, la escritura sigue siendo full-file).
- **Docker corre como root + `chmod -R 777`**: superficie de ataque si el contenedor se expusiera; documentado como tradeoff consciente por temas de permisos en Railway.

### Seguridad / acceso
- **Sin autenticación**: aceptable hoy (uso personal), pero es un requisito duro antes de compartir el link con alguien más o exponerlo fuera de una red confiable.

### Features que un usuario esperaría y siguen sin existir
1. **Exportar datos (CSV/JSON)** — todo vive en un JSON local; un botón "descargar respaldo" es barato y da tranquilidad ante pérdida de datos.
2. **Notificaciones/recordatorio de aporte mensual** — hoy el usuario tiene que entrar a la app para ver si ya aportó este mes; un recordatorio (push, email, o simplemente un banner más visible) cerraría el loop.
3. **Categorías/etiquetas de metas** (viaje, emergencia, fondo de inversión, etc.) más allá del emoji libre — útil si el número de metas crece y se quiere filtrar/agrupar.
4. **Meta compartida multiusuario** (pareja/familia ahorrando a la misma meta) — el nombre "ahorros" sugiere esto, pero la arquitectura actual (single-user, sin auth) es la base más grande que tocar si se quiere ir por acá; no es un cambio incremental, es rediseño de modelo de datos + auth.
5. **Undo de eliminar** (meta o movimiento) — hay confirmación antes de borrar, pero una vez confirmado no hay forma de deshacer. Un toast tipo "Meta eliminada — Deshacer" con ventana de unos segundos sería barato de agregar y reduce el riesgo residual que queda incluso con confirmación.
6. **Recalcular historial visible tras editar/borrar un movimiento paginado**: hoy, al editar o borrar un movimiento, `loadData()` resetea las páginas extra cargadas (`movementPages`) — si el usuario había hecho "Cargar más" y edita algo en esa página, tiene que volver a apretar el botón para verla de nuevo. Tradeoff aceptado en su momento, pero vale la pena si molesta en el uso real.

### Priorización sugerida (si hay que elegir)
1. **Exportar datos** — bajo costo, alto valor percibido (tranquilidad ante pérdida de datos en una app sin backups automáticos).
2. **Tests para `actions.ts`** — no se ve en la UI pero es lo que evita que un refactor futuro rompa el recálculo de saldos silenciosamente.
3. **Undo al eliminar** — cierra el último hueco de riesgo de pérdida de datos que quedó tras agregar confirmación.

---

*Actualizado tras implementar: refactor de componentes, confirmación de borrado, dependencias muertas, edición/borrado de movimientos, historial paginado, proyecciones con fecha objetivo, mejoras de accesibilidad y UI.*

---

## 🚀 Ronda de mejoras (auditoría exhaustiva)

Implementado en olas incrementales, cada una con build + typecheck + tests en verde.

### Ola 1 — Limpieza y bugs de bajo riesgo
- **DRY**: `round2` e `isTargetReached` → `src/lib/money.ts`; constantes (rate default, ícono, tamaño de página, meses de historial, `MONTH_LABELS`) → `src/lib/constants.ts`; asignación → `src/lib/goals/allocation.ts`; resumen mensual → `src/lib/goals/summary.ts`. Eliminadas las copias duplicadas.
- **Bug**: `getMonthlySummary` ahora devuelve **12 meses** (antes 6) → la racha y la tendencia dejan de toparse en 6.
- **Bug**: la semilla de "Cargar más" usaba `movements.length === 10` (botón fantasma con exactamente 10 movimientos) → ahora usa `movementsTotal`.
- **Bug**: `getMovements` sube el tope de `limit` de 50 a 500 (restauración de páginas tras recargar).
- **Bug**: `ensureFile` usa flag `wx` (evita doble escritura en el primer arranque); `createGoal` redondea `targetAmount`.
- **Limpieza**: eliminado código muerto (`getGoalById`, `updateGoalTarget`); ESLint ignora `.next/`.

### Ola 2 — Red de seguridad (tests + CI)
- **Vitest** configurado; 40 tests que cubren la lógica que se rompe en silencio (money, allocation, summary, projection, y las actions vía `DATA_DIR` temporal).
- **CI**: nuevos jobs `typecheck` y `test`; `build` depende de los tres.

### Ola 3 — Valor de usuario
- **Exportar/Importar respaldo** (`backup/actions.ts` + `BackupControls`): descarga JSON, exporta CSV de movimientos e importa un respaldo (reemplazo con confirmación).
- **Deshacer al eliminar** (meta/movimiento/deuda/pago): las actions de borrado devuelven la entidad y hay `restore*` para reinsertarla; `UndoToast` da la ventana para deshacer.

### Ola 4 — Endurecimiento
- **Cabeceras de seguridad** en `next.config.js` (CSP, X-Frame-Options, etc.).
- **Auth opcional de servidor** (`middleware.ts`) activada por `APP_ACCESS_PASSWORD` — protege también las Server Actions. Sin la variable, la app sigue sin auth.
- **Modales accesibles** (`useModalA11y`): focus-trap, Escape y restauración de foco en `DeleteConfirmModal` y `PinOverlay`.

### Ola 5 — Documentación
- README, `CLAUDE.md`, `SECURITY.md` y este archivo actualizados (comandos de test, features, variables de entorno, auth opcional).

## 🕓 Deferido a propósito (con razón)

| Mejora | Por qué se difiere |
|---|---|
| Optimistic updates (reemplazar el `loadData()` completo) | Cambia el flujo de datos central; riesgo de regresión alto para una ganancia de latencia menor en una app de un usuario. |
| Extraer más subcomponentes de `page.tsx` | `page.tsx` ya delega la mayor parte en componentes; más extracción es churn con poco retorno hoy. |
| Categorías/etiquetas de metas | Feature real pero implica cambio de modelo de datos + UI; mejor decidir alcance antes. |
| PIN con PBKDF2/sal | El PIN es solo candado de UI; el riesgo real (acceso de servidor) ya se cubre con `APP_ACCESS_PASSWORD`. Migrar el hash rompería PINs existentes. |
| Abstraer `store.ts` tras interfaz `DataStore` | Sin valor inmediato al volumen actual; hacerlo cuando se plantee migrar a SQLite. |
| Upgrades mayores (`framer-motion` 10→actual, `recharts` 2→3) | Requieren QA visual manual que no se puede validar automáticamente; Dependabot ya vigila. |
| Recordatorio de aporte mensual (push/PWA) | Necesita decisión de producto (canal, permisos). |
