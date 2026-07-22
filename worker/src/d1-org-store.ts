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

// Numero di righe modificate dall'ultima statement (D1 espone res.meta.changes).
function cambi(res: unknown): number {
  return (res as { meta?: { changes?: number } })?.meta?.changes ?? 0
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
    async putSeVersione(row, base) {
      // Compare-and-set in una singola statement atomica (SQLite/D1): niente
      // finestra tra "leggi versione" e "scrivi" in cui due dispositivi possano
      // entrambi passare il controllo e sovrascriversi (lost-update).
      if (base === 0) {
        // Il documento non deve esistere: crea solo se assente.
        const res = await db
          .prepare(
            'INSERT INTO organizzazioni (codice, doc, version, updatedAt, societa_id) VALUES (?, ?, ?, ?, ?) ' +
              'ON CONFLICT(codice) DO NOTHING',
          )
          .bind(row.codice, row.doc, row.version, row.updatedAt, row.societaId ?? null)
          .run()
        return cambi(res) > 0
      }
      // Aggiorna solo se la versione corrente combacia con la base attesa.
      const res = await db
        .prepare('UPDATE organizzazioni SET doc = ?, version = ?, updatedAt = ?, societa_id = ? WHERE codice = ? AND version = ?')
        .bind(row.doc, row.version, row.updatedAt, row.societaId ?? null, row.codice, base)
        .run()
      return cambi(res) > 0
    },
    async delete(codice) {
      await db.prepare('DELETE FROM organizzazioni WHERE codice = ?').bind(codice).run()
    },
    async elenco(societaId) {
      const col = 'codice, doc, version, updatedAt, societa_id AS societaId'
      const q =
        societaId == null
          ? db.prepare(`SELECT ${col} FROM organizzazioni`)
          : db.prepare(`SELECT ${col} FROM organizzazioni WHERE societa_id = ?`).bind(societaId)
      const { results } = await q.all<OrgRecord>()
      return results
    },
    async assegnaSocieta(codice, societaId) {
      await db.prepare('UPDATE organizzazioni SET societa_id = ? WHERE codice = ?').bind(societaId, codice).run()
    },
  }
}
