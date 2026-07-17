import { describe, it, expect } from 'vitest'
import { buildCalendarGrid, nuovaCollocazione, CAMPO_VUOTO } from './calendarGrid'
import type { Match } from './types'

function m(p: Partial<Match> & { id: string }): Match {
  return { tournamentId: 't', fase: 'girone', round: 1, teamAId: 'a', teamBId: 'b', set: [], stato: 'programmata', ...p }
}

describe('buildCalendarGrid', () => {
  it('esclude le partite senza orario', () => {
    const g = buildCalendarGrid([m({ id: '1' })])
    expect(g).toEqual([])
  })

  it('raggruppa per giornata, ordinate per data', () => {
    const g = buildCalendarGrid([
      m({ id: '2', orario: '2026-07-21T09:00', campo: '1' }),
      m({ id: '1', orario: '2026-07-20T09:00', campo: '1' }),
    ])
    expect(g.map((x) => x.data)).toEqual(['2026-07-20', '2026-07-21'])
  })

  it('colonne = campi distinti in ordine numerico; righe = orari ordinati', () => {
    const g = buildCalendarGrid([
      m({ id: '1', orario: '2026-07-20T09:30', campo: '2' }),
      m({ id: '2', orario: '2026-07-20T09:00', campo: '1' }),
      m({ id: '3', orario: '2026-07-20T09:00', campo: '2' }),
    ])
    expect(g[0].campi).toEqual(['1', '2'])
    expect(g[0].orari).toEqual(['09:00', '09:30'])
  })

  it('mette la partita nella cella (orario, campo) giusta; celle vuote senza partite', () => {
    const g = buildCalendarGrid([
      m({ id: '1', orario: '2026-07-20T09:00', campo: '1' }),
      m({ id: '2', orario: '2026-07-20T09:30', campo: '2' }),
    ])
    const cella = (o: string, c: string) => g[0].celle.find((x) => x.orario === o && x.campo === c)!
    expect(cella('09:00', '1').partite.map((p) => p.id)).toEqual(['1'])
    expect(cella('09:00', '2').partite).toEqual([])
    expect(cella('09:30', '2').partite.map((p) => p.id)).toEqual(['2'])
  })

  it('campo mancante -> colonna "Da definire", ordinata per ultima', () => {
    const g = buildCalendarGrid([
      m({ id: '1', orario: '2026-07-20T09:00', campo: '1' }),
      m({ id: '2', orario: '2026-07-20T09:00' }),
    ])
    expect(g[0].campi).toEqual(['1', CAMPO_VUOTO])
  })

  it('collisione: due partite sullo stesso incrocio stanno nella stessa cella', () => {
    const g = buildCalendarGrid([
      m({ id: '1', orario: '2026-07-20T09:00', campo: '1' }),
      m({ id: '2', orario: '2026-07-20T09:00', campo: '1' }),
    ])
    const cella = g[0].celle.find((x) => x.orario === '09:00' && x.campo === '1')!
    expect(cella.partite.map((p) => p.id)).toEqual(['1', '2'])
  })
})

describe('nuovaCollocazione', () => {
  it('compone orario giorno+ora e tiene il campo', () => {
    expect(nuovaCollocazione('2026-07-20', '19:00', '2')).toEqual({ orario: '2026-07-20T19:00', campo: '2' })
  })
  it('mappa la colonna "Da definire" a campo vuoto', () => {
    expect(nuovaCollocazione('2026-07-20', '19:00', CAMPO_VUOTO)).toEqual({ orario: '2026-07-20T19:00', campo: '' })
  })
})
