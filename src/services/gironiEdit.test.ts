import { describe, it, expect } from 'vitest'
import { spostaSquadra, aggiungiGirone, rimuoviGirone } from './gironiEdit'
import type { Tournament, Group, Match } from '../engine/types'

const torneo = { id: 'T', formato: 'gironi_eliminazione' } as unknown as Tournament

const gruppi = (): Group[] => [
  { id: 'A', tournamentId: 'T', nome: 'Girone A', teamIds: ['t1', 't2', 't3'] },
  { id: 'B', tournamentId: 'T', nome: 'Girone B', teamIds: ['t4', 't5', 't6'] },
]
// una partita di tabellone + le partite girone rigenerabili
const partite = (): Match[] => [
  { id: 'tab1', tournamentId: 'T', fase: 'tabellone', round: 1, teamAId: 'x', teamBId: 'y', set: [], stato: 'programmata' },
  { id: 'gA', tournamentId: 'T', fase: 'girone', groupId: 'A', round: 1, teamAId: 't1', teamBId: 't2', set: [{ puntiA: 21, puntiB: 10 }], stato: 'conclusa' },
  { id: 'gB', tournamentId: 'T', fase: 'girone', groupId: 'B', round: 1, teamAId: 't4', teamBId: 't5', set: [], stato: 'programmata' },
]

describe('gironiEdit', () => {
  it('spostaSquadra sposta la squadra nel girone di destinazione', () => {
    const { groups } = spostaSquadra(torneo, gruppi(), partite(), 't3', 'B')
    expect(groups.find((g) => g.id === 'A')!.teamIds).toEqual(['t1', 't2'])
    expect(groups.find((g) => g.id === 'B')!.teamIds).toEqual(['t4', 't5', 't6', 't3'])
  })

  it('rigenera le partite dei soli gironi coinvolti e conserva il tabellone', () => {
    const { matches } = spostaSquadra(torneo, gruppi(), partite(), 't3', 'B')
    // tabellone intatto
    expect(matches.find((m) => m.id === 'tab1')).toBeDefined()
    // A ora 2 squadre -> 1 partita; B ora 4 squadre -> 6 partite
    expect(matches.filter((m) => m.fase === 'girone' && m.groupId === 'A')).toHaveLength(1)
    expect(matches.filter((m) => m.fase === 'girone' && m.groupId === 'B')).toHaveLength(6)
    // le vecchie partite girone (con punteggi) sono sostituite da partite nuove programmate
    expect(matches.find((m) => m.id === 'gA')).toBeUndefined()
    expect(matches.filter((m) => m.fase === 'girone').every((m) => m.stato === 'programmata')).toBe(true)
  })

  it('spostaSquadra è no-op se la squadra è già nel girone di destinazione', () => {
    const g = gruppi()
    const m = partite()
    const r = spostaSquadra(torneo, g, m, 't1', 'A')
    expect(r.groups).toBe(g)
    expect(r.matches).toBe(m)
  })

  it('spostaSquadra è no-op se il girone di destinazione non esiste', () => {
    const g = gruppi()
    const r = spostaSquadra(torneo, g, partite(), 't1', 'NOPE')
    expect(r.groups).toBe(g)
  })

  it('aggiungiGirone aggiunge un girone vuoto con la lettera successiva', () => {
    const g = aggiungiGirone(torneo, gruppi())
    expect(g).toHaveLength(3)
    expect(g[2]).toMatchObject({ nome: 'Girone C', teamIds: [] })
  })

  it('rimuoviGirone rimuove un girone vuoto', () => {
    const g = [...gruppi(), { id: 'C', tournamentId: 'T', nome: 'Girone C', teamIds: [] as string[] }]
    const { groups } = rimuoviGirone(g, partite(), 'C')
    expect(groups.map((x) => x.id)).toEqual(['A', 'B'])
  })

  it('rimuoviGirone NON rimuove un girone con squadre', () => {
    const g = gruppi()
    const m = partite()
    const r = rimuoviGirone(g, m, 'A')
    expect(r.groups).toBe(g)
    expect(r.matches).toBe(m)
  })
})
