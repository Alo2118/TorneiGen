import { describe, it, expect } from 'vitest'
import { pianifica, type CalendarioConfig } from './scheduler'
import type { Match } from './types'

function m(id: string, a: string | null, b: string | null, round = 1): Match {
  return { id, tournamentId: 't1', fase: 'girone', round, teamAId: a, teamBId: b, set: [], stato: 'programmata' }
}
const cfg = (over: Partial<CalendarioConfig> = {}): CalendarioConfig => ({
  giornate: [{ data: '2026-09-04', inizio: '19:00', fine: '23:00' }], numeroCampi: 1, durataMin: 30, ...over,
})

describe('pianifica', () => {
  it('assegna orario e campo alle partite', () => {
    const out = pianifica([m('1', 'A', 'B'), m('2', 'C', 'D')], cfg())
    expect(out.every((x) => x.orario && x.campo)).toBe(true)
  })

  it('non mette la stessa squadra in due partite allo stesso orario', () => {
    // A gioca in 2 partite: devono avere orari diversi
    const out = pianifica([m('1', 'A', 'B'), m('2', 'A', 'C')], cfg({ numeroCampi: 2 }))
    const p1 = out.find((x) => x.id === '1')!, p2 = out.find((x) => x.id === '2')!
    expect(p1.orario).not.toBe(p2.orario)
  })

  it('non mette due partite sullo stesso campo allo stesso orario', () => {
    const out = pianifica([m('1', 'A', 'B'), m('2', 'C', 'D')], cfg({ numeroCampi: 1 }))
    const p1 = out.find((x) => x.id === '1')!, p2 = out.find((x) => x.id === '2')!
    // stesso campo (1) → orari diversi
    expect(`${p1.orario}#${p1.campo}`).not.toBe(`${p2.orario}#${p2.campo}`)
  })

  it('riempie la prima giornata e passa alla seconda', () => {
    // 3 partite, 1 campo, fascia 19:00–20:00 (2 slot da 30) → la 3ª va al giorno dopo
    const out = pianifica(
      [m('1', 'A', 'B'), m('2', 'C', 'D'), m('3', 'E', 'F')],
      cfg({ giornate: [{ data: '2026-09-04', inizio: '19:00', fine: '20:00' }, { data: '2026-09-05', inizio: '19:00', fine: '20:00' }], numeroCampi: 1 }),
    )
    const g = out.map((x) => x.orario!.slice(0, 10))
    expect(g).toContain('2026-09-05')
  })

  it('rispetta l\'ordine dei round (round 1 prima del round 2)', () => {
    const out = pianifica([m('2', 'W1', 'W2', 2), m('1', 'A', 'B', 1)], cfg({ numeroCampi: 1 }))
    const r1 = out.find((x) => x.id === '1')!, r2 = out.find((x) => x.id === '2')!
    expect(r1.orario! <= r2.orario!).toBe(true)
  })

  it('evita loop infinito con durataMin <= 0', () => {
    const out = pianifica([m('1', 'A', 'B')], cfg({ durataMin: 0 }))
    expect(out[0].orario).toBeUndefined()
  })
})
