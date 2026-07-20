import { describe, it, expect, vi, afterEach } from 'vitest'
import { verificaConnessione } from './verifica'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

function fetchMap(map: Record<string, number>) {
  return vi.fn(async (url: string) => {
    const status = url.includes('/iscrizioni/') ? map.iscrizioni : map.torneo
    return new Response('{}', { status, headers: { 'content-type': 'application/json' } })
  })
}

describe('verificaConnessione', () => {
  it('URL raggiungibile + sessione valida → ok', async () => {
    localStorage.setItem('sessione', 'jwt-finto')
    vi.stubGlobal('fetch', fetchMap({ torneo: 404, iscrizioni: 404 }))
    const r = await verificaConnessione()
    expect(r.ok).toBe(true)
  })
  it('senza sessione → chiede di accedere', async () => {
    vi.stubGlobal('fetch', fetchMap({ torneo: 404, iscrizioni: 404 }))
    const r = await verificaConnessione()
    expect(r.ok).toBe(false)
    expect(r.messaggio).toMatch(/accedi/i)
  })
  it('sessione non valida (401) → non ok', async () => {
    localStorage.setItem('sessione', 'jwt-finto')
    vi.stubGlobal('fetch', fetchMap({ torneo: 404, iscrizioni: 401 }))
    const r = await verificaConnessione()
    expect(r.ok).toBe(false)
    expect(r.messaggio).toMatch(/sessione/i)
  })
  it('URL irraggiungibile (fetch fallisce) → non ok', async () => {
    localStorage.setItem('sessione', 'jwt-finto')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const r = await verificaConnessione()
    expect(r.ok).toBe(false)
    expect(r.messaggio).toMatch(/raggiung/i)
  })
})
