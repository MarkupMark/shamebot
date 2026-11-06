import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import type { Db, SqlParam, SqlRow } from "../src/services/db.js";
import { HouseStore } from "../src/services/store.js";

/** Database SQLite in memoria con tutte le migrazioni applicate. */
export function createTestStore(): { store: HouseStore; db: Db } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, dir), "utf8"));
  }

  const db: Db = {
    async all(sql, params: SqlParam[] = []) {
      return sqlite.prepare(sql).all(...params) as SqlRow[];
    },
    async first(sql, params: SqlParam[] = []) {
      return (sqlite.prepare(sql).get(...params) as SqlRow | undefined) ?? null;
    },
    async run(sql, params: SqlParam[] = []) {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: result.changes, lastRowId: Number(result.lastInsertRowid) };
    },
  };
  return { store: new HouseStore(db), db };
}

export const hour = 3_600_000;
export const day = 24 * hour;
