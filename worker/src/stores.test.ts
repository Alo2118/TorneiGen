import { describe, it, expect } from 'vitest'
import { fakeUserStore } from './fake-user-store'
import { fakeSocietaStore } from './fake-societa-store'
import type { UtenteRecord } from './handler'

const u = (over: Partial<UtenteRecord> = {}): UtenteRecord => ({
  id: 'u1', email: 'a@x.it', password_hash: 'h', salt: 's', iterazioni: 1, ruolo: 'utente',
  abilitato: 0, societa_id: null, societa_richiesta: 'Club', creato_il: 'now', ...over,
})

describe('fakeUserStore', () => {
  it('crea, perEmail (case-insensitive), perId, elenco, abilita', async () => {
    const s = fakeUserStore()
    await s.crea(u({ email: 'A@X.it' }))
    expect((await s.perEmail('a@x.it'))?.id).toBe('u1')
    expect((await s.perId('u1'))?.email).toBe('a@x.it')
    expect(await s.elenco()).toHaveLength(1)
    await s.abilita('u1', 'soc1', true)
    const dopo = await s.perId('u1')
    expect(dopo?.abilitato).toBe(1); expect(dopo?.societa_id).toBe('soc1')
  })

  it('crea rifiuta una email duplicata (parità col vincolo UNIQUE di D1)', async () => {
    const s = fakeUserStore()
    await s.crea(u({ id: 'u1', email: 'a@x.it' }))
    await expect(s.crea(u({ id: 'u2', email: 'A@X.it' }))).rejects.toThrow()
    expect(await s.elenco()).toHaveLength(1)
  })

  it('elenco ordina per creato_il decrescente (come D1)', async () => {
    const s = fakeUserStore()
    await s.crea(u({ id: 'u1', email: '1@x.it', creato_il: '2024-01-01' }))
    await s.crea(u({ id: 'u2', email: '2@x.it', creato_il: '2024-03-01' }))
    await s.crea(u({ id: 'u3', email: '3@x.it', creato_il: '2024-02-01' }))
    expect((await s.elenco()).map((r) => r.id)).toEqual(['u2', 'u3', 'u1'])
  })
})

describe('fakeSocietaStore', () => {
  it('crea, elenco, perId', async () => {
    const s = fakeSocietaStore()
    await s.crea({ id: 'soc1', nome: 'Beach Club', creato_il: 'now' })
    expect(await s.elenco()).toHaveLength(1)
    expect((await s.perId('soc1'))?.nome).toBe('Beach Club')
  })

  it('elenco ordina per creato_il decrescente (come D1)', async () => {
    const s = fakeSocietaStore()
    await s.crea({ id: 'a', nome: 'A', creato_il: '2024-01-01' })
    await s.crea({ id: 'b', nome: 'B', creato_il: '2024-03-01' })
    await s.crea({ id: 'c', nome: 'C', creato_il: '2024-02-01' })
    expect((await s.elenco()).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })
})
