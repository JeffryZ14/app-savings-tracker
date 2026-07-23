import type { DbShape } from "@/lib/db/store";

/** Backend de persistencia: lee/escribe el estado completo de la app. La cola de escritura
 * (`withDb` en store.ts) vive fuera de esta interfaz — un DataStore sólo sabe leer y escribir,
 * no serializar accesos concurrentes. Implementación actual: JsonFileStore (archivo plano). */
export interface DataStore {
  read(): Promise<DbShape>;
  write(db: DbShape): Promise<void>;
}
