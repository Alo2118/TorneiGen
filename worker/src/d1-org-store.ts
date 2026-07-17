import type { OrgStore } from './handler'
import type { OrgRecord } from '../../src/types/org'

// Interfaccia minima di D1 (evita la dipendenza da @cloudflare/workers-types)
interface D1Bound {
  first<T = unknown>(): Promise<T | null>
  run(): Promise<unknown>
  all<T = unknown>(): Promise<{ results: T[] }>
}
interface D1Prepared extends D1Bound {
  bind(...vals: unknown[]): D1Bound
}
export interface D1Like {
  prepare(sql: string): D1Prepared
}

export function d1OrgStore(db: D1Like): OrgStore {
  return {
    async get(codice) {
      const row = await db
        .prepare(
          'SELECT codice, doc, version, updatedAt, societa_id AS societaId FROM organizzazioni WHERE codice = ?',
        )
        .bind(codice)
        .first<OrgRecord>()
      return row ?? null
    },
    async put(row) {
      await db
        .prepare(
          'INSERT INTO organizzazioni (codice, doc, version, updatedAt, societa_id) VALUES (?, ?, ?, ?, ?) ' +
            'ON CONFLICT(codice) DO UPDATE SET doc = excluded.doc, version = excluded.version, updatedAt = excluded.updatedAt, societa_id = excluded.societa_id',
        )
        .bind(row.codice, row.doc, row.version, row.updatedAt, row.societaId ?? null)
        .run()
    },
    async delete(codice) {
      await db.prepare('DELETE FROM organizzazioni WHERE codice = ?').bind(codice).run()
    },
  }
}
