export type SqlParam = string | number | null;
export type SqlRow = Record<string, unknown>;

export type RunResult = {
  changes: number;
  lastRowId: number;
};

/** Interfaccia minima di accesso al database, implementata sia per Cloudflare D1 sia per SQLite locale. */
export interface Db {
  all(sql: string, params?: SqlParam[]): Promise<SqlRow[]>;
  first(sql: string, params?: SqlParam[]): Promise<SqlRow | null>;
  run(sql: string, params?: SqlParam[]): Promise<RunResult>;
}

export function createD1Db(d1: D1Database): Db {
  return {
    async all(sql, params = []) {
      const result = await d1.prepare(sql).bind(...params).all<SqlRow>();
      return result.results ?? [];
    },
    async first(sql, params = []) {
      return await d1.prepare(sql).bind(...params).first<SqlRow>();
    },
    async run(sql, params = []) {
      const result = await d1.prepare(sql).bind(...params).run();
      return {
        changes: result.meta?.changes ?? 0,
        lastRowId: result.meta?.last_row_id ?? 0,
      };
    },
  };
}
