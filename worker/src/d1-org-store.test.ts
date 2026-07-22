import { describe, it, expect } from 'vitest'
import { d1OrgStore } from './d1-org-store'
import type { OrgRecord } from '../../src/types/org'

// Fake D1 minimale: registra le query e restituisce righe pilotate.
// run() su una INSERT scrive davvero in rowByCodice (simulando le colonne
// codice/doc/version/updatedAt/societa_id nell'ordine usato da d1OrgStore.put),
// cosi' un put() seguito da un get() e' un vero round-trip, non solo un mock.
function fakeD1(rowByCodice: Record<string, OrgRecord> = {}) {
  const calls: { sql: string; binds: unknown[] }[] = []
  return {
    calls,
    prepare(sql: string) {
      return {
        async first() {
          throw new Error('fakeD1: first() senza bind() non supportato in questo test')
        },
        async run() {
          throw new Error('fakeD1: run() senza bind() non supportato in questo test')
        },
        async all<T>() {
          calls.push({ sql, binds: [] })
          return { results: [] as T[] }
        },
        bind(...binds: unknown[]) {
          calls.push({ sql, binds })
          return {
            async first<T>() {
              const codice = binds[0] as string
              return (rowByCodice[codice] as unknown as T) ?? null
            },
            async all<T>() {
              return { results: [] as T[] }
            },
            async run() {
              // INSERT ... ON CONFLICT(codice) DO NOTHING  (putSeVersione base 0)
              if (/^insert into organizzazioni.*do nothing/i.test(sql)) {
                const [codice, doc, version, updatedAt, societaId] = binds as [string, string, number, string, string | null]
                if (rowByCodice[codice]) return { meta: { changes: 0 } }
                rowByCodice[codice] = { codice, doc, version, updatedAt, societaId: societaId ?? null }
                return { meta: { changes: 1 } }
              }
              // INSERT ... ON CONFLICT DO UPDATE  (put upsert incondizionato)
              if (/^insert into organizzazioni/i.test(sql)) {
                const [codice, doc, version, updatedAt, societaId] = binds as [string, string, number, string, string | null]
                rowByCodice[codice] = { codice, doc, version, updatedAt, societaId: societaId ?? null }
                return { meta: { changes: 1 } }
              }
              // UPDATE ... SET doc = ? ... WHERE codice = ? AND version = ?  (putSeVersione base>0)
              if (/^update organizzazioni set doc/i.test(sql)) {
                const [doc, version, updatedAt, societaId, codice, base] = binds as [string, number, string, string | null, string, number]
                const r = rowByCodice[codice]
                if (!r || r.version !== base) return { meta: { changes: 0 } }
                rowByCodice[codice] = { codice, doc, version, updatedAt, societaId: societaId ?? null }
                return { meta: { changes: 1 } }
              }
              return { meta: { changes: 0 } }
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
    expect(c.binds).toEqual(['ABC', '{}', 2, 't', null])
  })
  it('delete cancella per codice', async () => {
    const db = fakeD1()
    await d1OrgStore(db).delete('ABC')
    const c = db.calls.at(-1)!
    expect(c.sql).toMatch(/delete from organizzazioni/i)
    expect(c.binds).toEqual(['ABC'])
  })

  it('round-trip: put con societaId lo persiste e get lo restituisce (chiude il leak cross-società)', async () => {
    const db = fakeD1()
    const store = d1OrgStore(db)
    await store.put({ codice: 'ABC', doc: '{"n":1}', version: 1, updatedAt: 't1', societaId: 's1' })
    const row = await store.get('ABC')
    expect(row?.societaId).toBe('s1')
  })

  it('round-trip: put senza societaId persiste null invece di perdere la colonna', async () => {
    const db = fakeD1()
    const store = d1OrgStore(db)
    await store.put({ codice: 'DEF', doc: '{}', version: 1, updatedAt: 't1' })
    const row = await store.get('DEF')
    expect(row?.societaId).toBeNull()

    await store.put({ codice: 'GHI', doc: '{}', version: 1, updatedAt: 't1', societaId: null })
    const row2 = await store.get('GHI')
    expect(row2?.societaId).toBeNull()
  })

  it('putSeVersione con base 0 crea se assente e rifiuta se già esiste (INSERT DO NOTHING atomico)', async () => {
    const db = fakeD1()
    const store = d1OrgStore(db)
    expect(await store.putSeVersione({ codice: 'ABC', doc: '{"a":1}', version: 1, updatedAt: 't1', societaId: 's1' }, 0)).toBe(true)
    expect((await store.get('ABC'))?.version).toBe(1)
    // seconda scrittura dalla stessa base 0: il documento ora esiste → conflitto
    expect(await store.putSeVersione({ codice: 'ABC', doc: '{"b":2}', version: 1, updatedAt: 't2', societaId: 's1' }, 0)).toBe(false)
    expect((await store.get('ABC'))?.doc).toBe('{"a":1}')
  })

  it('putSeVersione aggiorna solo se la versione base combacia (UPDATE condizionato atomico)', async () => {
    const db = fakeD1({ ABC: { codice: 'ABC', doc: '{}', version: 5, updatedAt: 't0', societaId: 's1' } })
    const store = d1OrgStore(db)
    // base sbagliata → nessuna scrittura
    expect(await store.putSeVersione({ codice: 'ABC', doc: '{"x":1}', version: 5, updatedAt: 't1', societaId: 's1' }, 4)).toBe(false)
    expect((await store.get('ABC'))?.version).toBe(5)
    // base giusta → scrive
    expect(await store.putSeVersione({ codice: 'ABC', doc: '{"x":1}', version: 6, updatedAt: 't1', societaId: 's1' }, 5)).toBe(true)
    expect((await store.get('ABC'))?.version).toBe(6)
  })

  it('putSeVersione previene il lost-update: seconda scrittura dalla base stantia va in conflitto', async () => {
    const db = fakeD1({ ABC: { codice: 'ABC', doc: '{}', version: 5, updatedAt: 't0', societaId: 's1' } })
    const store = d1OrgStore(db)
    expect(await store.putSeVersione({ codice: 'ABC', doc: '{"a":1}', version: 6, updatedAt: 't1', societaId: 's1' }, 5)).toBe(true)
    expect(await store.putSeVersione({ codice: 'ABC', doc: '{"b":2}', version: 6, updatedAt: 't2', societaId: 's1' }, 5)).toBe(false)
    expect((await store.get('ABC'))?.doc).toBe('{"a":1}')
  })

  it('elenco(null) seleziona tutte le organizzazioni, senza WHERE', async () => {
    const db = fakeD1()
    await d1OrgStore(db).elenco(null)
    const c = db.calls.at(-1)!
    expect(c.sql).toMatch(/select .* from organizzazioni\s*$/i)
    expect(c.sql).not.toMatch(/where/i)
    expect(c.binds).toEqual([])
  })

  it('elenco(societaId) filtra per societa_id col bind giusto (no leak cross-società)', async () => {
    const db = fakeD1()
    await d1OrgStore(db).elenco('s1')
    const c = db.calls.at(-1)!
    expect(c.sql).toMatch(/where societa_id = \?/i)
    expect(c.binds).toEqual(['s1'])
  })
})
