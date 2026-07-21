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
