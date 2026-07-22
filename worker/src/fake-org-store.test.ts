import { describe, it, expect } from 'vitest'
import { fakeOrgStore } from './fake-org-store'

describe('fakeOrgStore.putSeVersione (compare-and-set atomico)', () => {
  it('crea con base 0 quando il documento non esiste', async () => {
    const s = fakeOrgStore()
    const ok = await s.putSeVersione({ codice: 'ABC', doc: '{}', version: 1, updatedAt: 't1', societaId: 's1' }, 0)
    expect(ok).toBe(true)
    expect((await s.get('ABC'))?.version).toBe(1)
  })

  it('rifiuta base 0 se il documento esiste già (conflitto)', async () => {
    const s = fakeOrgStore([{ codice: 'ABC', doc: '{}', version: 3, updatedAt: 't0', societaId: 's1' }])
    const ok = await s.putSeVersione({ codice: 'ABC', doc: '{"x":1}', version: 1, updatedAt: 't1', societaId: 's1' }, 0)
    expect(ok).toBe(false)
    expect((await s.get('ABC'))?.version).toBe(3)
  })

  it('aggiorna solo se la versione base combacia', async () => {
    const s = fakeOrgStore([{ codice: 'ABC', doc: '{}', version: 5, updatedAt: 't0', societaId: 's1' }])
    const ok = await s.putSeVersione({ codice: 'ABC', doc: '{"x":1}', version: 6, updatedAt: 't1', societaId: 's1' }, 5)
    expect(ok).toBe(true)
    expect((await s.get('ABC'))?.version).toBe(6)
  })

  it('previene il lost-update: due scritture dalla stessa base, la seconda va in conflitto', async () => {
    const s = fakeOrgStore([{ codice: 'ABC', doc: '{}', version: 5, updatedAt: 't0', societaId: 's1' }])
    const primo = await s.putSeVersione({ codice: 'ABC', doc: '{"a":1}', version: 6, updatedAt: 't1', societaId: 's1' }, 5)
    const secondo = await s.putSeVersione({ codice: 'ABC', doc: '{"b":2}', version: 6, updatedAt: 't2', societaId: 's1' }, 5)
    expect(primo).toBe(true)
    expect(secondo).toBe(false)
    // il documento del primo scrittore non è stato sovrascritto dal secondo
    expect((await s.get('ABC'))?.doc).toBe('{"a":1}')
    expect((await s.get('ABC'))?.version).toBe(6)
  })
})
