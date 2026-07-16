import type { OrgStore } from './handler'
import type { OrgRecord } from '../../src/types/org'

// Interfaccia minima di D1 (evita la dipendenza da @cloudflare/workers-types)
interface D1Bound {
  first<T = unknown>(): Promise<T | null>
  run(): Promise<unknown>
}
interface D1Prepared {
  bind(...vals: unknown[]): D1Bound
}
export interface D1Like {
  prepare(sql: string): D1Prepared
}

export function d1OrgStore(db: D1Like): OrgStore {
  return {
    async get(codice) {
      const row = await db
        .prepare('SELECT codice, doc, version, updatedAt FROM organizzazioni WHERE codice = ?')
        .bind(codice)
        .first<OrgRecord>()
      return row ?? null
    },
    async put(row) {
      await db
        .prepare(
          'INSERT INTO organizzazioni (codice, doc, version, updatedAt) VALUES (?, ?, ?, ?) ' +
            'ON CONFLICT(codice) DO UPDATE SET doc = excluded.doc, version = excluded.version, updatedAt = excluded.updatedAt',
        )
        .bind(row.codice, row.doc, row.version, row.updatedAt)
        .run()
    },
    async delete(codice) {
      await db.prepare('DELETE FROM organizzazioni WHERE codice = ?').bind(codice).run()
    },
  }
}
