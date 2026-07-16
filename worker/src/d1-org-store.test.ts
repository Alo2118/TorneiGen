import { describe, it, expect } from 'vitest'
import { d1OrgStore } from './d1-org-store'
import type { OrgRecord } from '../../src/types/org'

// Fake D1 minimale: registra le query e restituisce righe pilotate
function fakeD1(rowByCodice: Record<string, OrgRecord> = {}) {
  const calls: { sql: string; binds: unknown[] }[] = []
  return {
    calls,
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql, binds })
          return {
            async first<T>() {
              const codice = binds[0] as string
              return (rowByCodice[codice] as unknown as T) ?? null
            },
            async run() {
              return {}
            },
          }
        },
      }
    },
  }
}

describe('d1OrgStore', () => {
  it('get restituisce la riga da D1', async () => {
    const db = fakeD1({ ABC: { codice: 'ABC', doc: '{"n":1}', version: 4, updatedAt: 't' } })
    const store = d1OrgStore(db)
    expect(await store.get('ABC')).toEqual({ codice: 'ABC', doc: '{"n":1}', version: 4, updatedAt: 't' })
  })
  it('get restituisce null se assente', async () => {
    const store = d1OrgStore(fakeD1())
    expect(await store.get('NOPE')).toBeNull()
  })
  it('put esegue un upsert con i valori giusti', async () => {
    const db = fakeD1()
    await d1OrgStore(db).put({ codice: 'ABC', doc: '{}', version: 2, updatedAt: 't' })
    const c = db.calls.at(-1)!
    expect(c.sql).toMatch(/insert into organizzazioni/i)
    expect(c.binds).toEqual(['ABC', '{}', 2, 't'])
  })
  it('delete cancella per codice', async () => {
    const db = fakeD1()
    await d1OrgStore(db).delete('ABC')
    const c = db.calls.at(-1)!
    expect(c.sql).toMatch(/delete from organizzazioni/i)
    expect(c.binds).toEqual(['ABC'])
  })
})
