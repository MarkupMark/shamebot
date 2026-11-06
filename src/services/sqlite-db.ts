import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db, RunResult, SqlParam, SqlRow } from "./db.js";

const migrationsDir = fileURLToPath(new URL("../../migrations", import.meta.url));

export function createSqliteDb(path: string): Db {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applyMigrations(sqlite);

  return {
    async all(sql: string, params: SqlParam[] = []) {
      return sqlite.prepare(sql).all(...params) as SqlRow[];
    },
    async first(sql: string, params: SqlParam[] = []) {
      return (sqlite.prepare(sql).get(...params) as SqlRow | undefined) ?? null;
    },
    async run(sql: string, params: SqlParam[] = []): Promise<RunResult> {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: result.changes, lastRowId: Number(result.lastInsertRowid) };
    },
  };
}

/**
 * Applica in ordine i file di migrations/ non ancora applicati.
 * Tollera le ALTER TABLE gia' eseguite, cosi' un database creato con la v1 si aggiorna senza errori.
 */
function applyMigrations(sqlite: Database.Database): void {
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(
    (sqlite.prepare("SELECT name FROM schema_migrations").all() as Array<{ name: string }>).map((row) => row.name),
  );

  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = readFileSync(`${migrationsDir}/${file}`, "utf8");
    try {
      sqlite.exec(sql);
    } catch (error) {
      if (!String(error).includes("duplicate column name")) {
        throw error;
      }
      runStatementsTolerant(sqlite, sql);
    }
    sqlite.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
  }
}

function runStatementsTolerant(sqlite: Database.Database, sql: string): void {
  const withoutComments = sql.replace(/--.*$/gm, "");
  for (const statement of withoutComments.split(";").map((part) => part.trim()).filter(Boolean)) {
    try {
      sqlite.exec(statement);
    } catch (error) {
      if (!String(error).includes("duplicate column name")) {
        throw error;
      }
    }
  }
}
