/** Valores por defecto y constantes compartidas (antes hardcodeados en múltiples archivos).
 * Aceptables para una app de un solo usuario; centralizados para tener un único lugar que
 * tocar si la app se generaliza. */

/** Ahorro mensual objetivo por defecto (S/). */
export const DEFAULT_MONTHLY_RATE = 1421;

/** Ícono por defecto de una meta nueva. */
export const DEFAULT_GOAL_ICON = "⭐";

/** Tamaño de página del historial de movimientos ("Cargar más"). */
export const MOVEMENTS_PAGE_SIZE = 10;

/** Meses de historial que devuelve getMonthlySummary (racha, tendencia, insights). */
export const MONTHS_OF_HISTORY = 12;

/** Etiquetas cortas de mes (es-PE), indexadas 0=Ene..11=Dic. */
export const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;
