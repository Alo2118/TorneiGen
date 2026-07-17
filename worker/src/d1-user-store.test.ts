import { describe, it, expect } from 'vitest'
import { d1UserStore } from './d1-user-store'
import { d1SocietaStore } from './d1-societa-store'
import type { UtenteRecord, SocietaRecord } from './handler'

// Fake D1 minimale per utenti+societa: le query INSERT/UPDATE scrivono
// davvero in tabelle in-memory (per id), cosi' crea/perEmail/perId/abilita/
// elenco sono un vero round-trip, non solo un mock che restituisce fixture.
function fakeD1() {
  const utenti = new Map<string, UtenteRecord>()
  const societa = new Map<string, SocietaRecord>()

  function bound(sql: string, binds: unknown[]) {
    return {
      async first<T>() {
        if (/from utenti where email = \?/i.test(sql)) {
          const email = binds[0] as string
          for (const r of utenti.values()) if (r.email === email) return r as unknown as T
          return null
        }
        if (/from utenti where id = \?/i.test(sql)) {
          return (utenti.get(binds[0] as string) as unknown as T) ?? null
        }
        if (/from societa where id = \?/i.test(sql)) {
          return (societa.get(binds[0] as string) as unknown as T) ?? null
        }
        throw new Error(`fakeD1: first() non gestito per: ${sql}`)
      },
      async all<T>() {
        if (/from utenti order by/i.test(sql)) {
          return { results: [...utenti.values()].sort((a, b) => (a.creato_il < b.creato_il ? 1 : -1)) as unknown as T[] }
        }
        if (/from societa order by/i.test(sql)) {
          return { results: [...societa.values()].sort((a, b) => (a.creato_il < b.creato_il ? 1 : -1)) as unknown as T[] }
        }
        throw new Error(`fakeD1: all() non gestito per: ${sql}`)
      },
      async run() {
        if (/^insert into utenti/i.test(sql)) {
          const [id, email, password_hash, salt, iterazioni, ruolo, abilitato, societa_id, societa_richiesta, creato_il] =
            binds as [string, string, string, string, number, UtenteRecord['ruolo'], number, string | null, string | null, string]
          utenti.set(id, { id, email, password_hash, salt, iterazioni, ruolo, abilitato, societa_id, societa_richiesta, creato_il })
          return {}
        }
        if (/^update utenti set abilitato/i.test(sql)) {
          const [abilitato, societaId, id] = binds as [number, string | null, string]
          const r = utenti.get(id)
          if (r) utenti.set(id, { ...r, abilitato, societa_id: societaId })
          return {}
        }
        if (/^insert into societa/i.test(sql)) {
          const [id, nome, creato_il] = binds as [string, string, string]
          societa.set(id, { id, nome, creato_il })
          return {}
        }
        throw new Error(`fakeD1: run() non gestito per: ${sql}`)
      },
    }
  }

  return {
    prepare(sql: string) {
      return {
        ...bound(sql, []),
        bind(...binds: unknown[]) {
          return bound(sql, binds)
        },
      }
    },
  }
}

describe('d1UserStore', () => {
  const u = (over: Partial<UtenteRecord> = {}): UtenteRecord => ({
    id: 'u1',
    email: 'A@X.it',
    password_hash: 'h',
    salt: 's',
    iterazioni: 100000,
    ruolo: 'utente',
    abilitato: 0,
    societa_id: null,
    societa_richiesta: 'Club',
    creato_il: 't1',
    ...over,
  })

  it('round-trip: crea, perEmail (case-insensitive), perId, abilita, elenco', async () => {
    const store = d1UserStore(fakeD1())
    await store.crea(u())

    const perEmail = await store.perEmail('a@x.it')
    expect(perEmail?.id).toBe('u1')
    expect(perEmail?.email).toBe('a@x.it')

    const perId = await store.perId('u1')
    expect(perId?.email).toBe('a@x.it')

    await store.abilita('u1', 'soc1', true)
    const dopo = await store.perId('u1')
    expect(dopo?.abilitato).toBe(1)
    expect(dopo?.societa_id).toBe('soc1')

    const elenco = await store.elenco()
    expect(elenco).toHaveLength(1)
    expect(elenco[0]?.id).toBe('u1')
  })

  it('perEmail/perId restituiscono null se assenti', async () => {
    const store = d1UserStore(fakeD1())
    expect(await store.perEmail('nope@x.it')).toBeNull()
    expect(await store.perId('nope')).toBeNull()
  })
})

describe('d1SocietaStore', () => {
  it('round-trip: crea, elenco, perId', async () => {
    const store = d1SocietaStore(fakeD1())
    await store.crea({ id: 'soc1', nome: 'Beach Club', creato_il: 't1' })

    expect((await store.perId('soc1'))?.nome).toBe('Beach Club')
    const elenco = await store.elenco()
    expect(elenco).toHaveLength(1)
    expect(elenco[0]?.nome).toBe('Beach Club')
  })

  it('perId restituisce null se assente', async () => {
    const store = d1SocietaStore(fakeD1())
    expect(await store.perId('nope')).toBeNull()
  })
})
