import { describe, it, expect } from 'vitest'
import { hashPassword, verificaPassword, creaJWT, verificaJWT, estraiBearer } from './auth'

describe('password', () => {
  it('verifica corretta e rifiuta sbagliata', async () => {
    const { hash, salt, iterazioni } = await hashPassword('segreta123')
    expect(await verificaPassword('segreta123', hash, salt, iterazioni)).toBe(true)
    expect(await verificaPassword('altra', hash, salt, iterazioni)).toBe(false)
  })
  it('salt diverso a ogni hash', async () => {
    const a = await hashPassword('x'); const b = await hashPassword('x')
    expect(a.salt).not.toEqual(b.salt)
  })
})

describe('jwt', () => {
  const seg = 'segreto-test'
  const base = { sub: 'u1', email: 'a@x.it', ruolo: 'utente' as const, societaId: 's1' }
  it('round-trip valido', async () => {
    const t = await creaJWT(base, seg, 3600, 1_000_000)
    const p = await verificaJWT(t, seg, 1_000_000)
    expect(p?.sub).toBe('u1'); expect(p?.societaId).toBe('s1'); expect(p?.ruolo).toBe('utente')
  })
  it('firma errata → null', async () => {
    const t = await creaJWT(base, seg, 3600, 1_000_000)
    expect(await verificaJWT(t, 'altro-segreto', 1_000_000)).toBeNull()
  })
  it('scaduto → null', async () => {
    const t = await creaJWT(base, seg, 3600, 1_000_000) // exp = 1000 + 3600 s
    expect(await verificaJWT(t, seg, 1_000_000 + 3_601_000)).toBeNull()
  })
  it('manomesso → null', async () => {
    const t = await creaJWT(base, seg, 3600, 1_000_000)
    const rotto = t.slice(0, -2) + (t.slice(-2) === 'aa' ? 'bb' : 'aa')
    expect(await verificaJWT(rotto, seg, 1_000_000)).toBeNull()
  })
})

describe('estraiBearer', () => {
  it('estrae il token', () => {
    expect(estraiBearer(new Request('https://x/', { headers: { authorization: 'Bearer abc' } }))).toBe('abc')
    expect(estraiBearer(new Request('https://x/'))).toBeNull()
  })
})
