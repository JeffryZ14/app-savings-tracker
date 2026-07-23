import { promises as fs } from "fs";
import { DEFAULT_DB, normalizeDb, type DbShape } from "@/lib/db/store";
import type { DataStore } from "@/lib/db/dataStore";

/** Persistencia en un único archivo JSON plano — ver CLAUDE.md para por qué (2 entidades, bajo
 * volumen de escritura, sin necesidad de una base de datos real para una app de un usuario). */
export class JsonFileStore implements DataStore {
  constructor(
    private readonly dataDir: string,
    private readonly dbFile: string
  ) {}

  private async ensureFile(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      // Flag "wx": crea sólo si no existe. Evita la carrera de dos lecturas concurrentes en el
      // primer arranque escribiendo ambas el archivo por defecto (la segunda falla con EEXIST).
      await fs.writeFile(this.dbFile, JSON.stringify(DEFAULT_DB, null, 2), {
        encoding: "utf-8",
        flag: "wx",
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }

  async read(): Promise<DbShape> {
    await this.ensureFile();
    const raw = await fs.readFile(this.dbFile, "utf-8");
    try {
      return normalizeDb(JSON.parse(raw) as Partial<DbShape>);
    } catch {
      return { ...DEFAULT_DB };
    }
  }

  async write(db: DbShape): Promise<void> {
    const tmp = this.dbFile + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf-8");
    await fs.rename(tmp, this.dbFile);
  }
}
