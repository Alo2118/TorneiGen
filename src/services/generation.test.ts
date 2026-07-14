import { describe, it, expect } from 'vitest'
import { generaTorneo } from './generation'
import type { Tournament, Team } from '../engine/types'

function team(id: string, seed?: number): Team {
  return { id, tournamentId: 't1', nome: id, players: [], testaDiSerie: seed, stato: 'confermata', origine: 'manuale' }
}
const base: Omit<Tournament, 'formato'> = {
  id: 't1', nome: 'T', tipologia: '2x2', data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'AAA',
}

describe('generaTorneo', () => {
  it('girone all\'italiana: un girone, round robin completo', () => {
    const t = { ...base, formato: 'girone_italiana' as const }
    const teams = ['A', 'B', 'C', 'D'].map((x) => team(x))
    const { groups, matches } = generaTorneo(t, teams)
    expect(groups).toHaveLength(1)
    expect(matches.filter((m) => m.fase === 'girone')).toHaveLength(6)
    expect(matches.every((m) => m.tournamentId === 't1')).toBe(true)
  })

  it('eliminazione diretta: match di tabellone secondo le teste di serie', () => {
    const t = { ...base, formato: 'eliminazione_diretta' as const }
    const teams = [team('S1', 1), team('S2', 2), team('S3', 3), team('S4', 4)]
    const { matches } = generaTorneo(t, teams)
    const tab = matches.filter((m) => m.fase === 'tabellone')
    expect(tab.length).toBe(3) // 2 semifinali + finale
    // S1 e S2 non si incontrano al primo round
    const r1 = tab.filter((m) => m.round === 1)
    const insieme = r1.some((m) => [m.teamAId, m.teamBId].includes('S1') && [m.teamAId, m.teamBId].includes('S2'))
    expect(insieme).toBe(false)
  })

  it('gironi + eliminazione: più gironi con round robin', () => {
    const t = { ...base, formato: 'gironi_eliminazione' as const }
    const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((x) => team(x))
    const { groups } = generaTorneo(t, teams)
    expect(groups.length).toBeGreaterThan(1)
  })

  it('King of the Court non è ancora supportato', () => {
    const t = { ...base, formato: 'king_of_the_court' as const }
    expect(() => generaTorneo(t, [team('A')])).toThrow(/King of the Court/i)
  })

  it('eliminazione doppia: crea match WB, LB e finale con i tipi', () => {
    const t = { ...base, formato: 'eliminazione_doppia' as const }
    const teams = [team('S1', 1), team('S2', 2), team('S3', 3), team('S4', 4)]
    const { matches } = generaTorneo(t, teams)
    expect(matches.some((m) => m.tabelloneTipo === 'vincenti')).toBe(true)
    expect(matches.some((m) => m.tabelloneTipo === 'perdenti')).toBe(true)
    expect(matches.filter((m) => m.tabelloneTipo === 'finale')).toHaveLength(1)
    // i link sono persistiti
    const wb1 = matches.find((m) => m.tabelloneTipo === 'vincenti' && m.round === 1)!
    expect(wb1.perdenteVerso).toBeTruthy()
  })

  it('eliminazione doppia: richiede numero di squadre potenza di 2', () => {
    const t = { ...base, formato: 'eliminazione_doppia' as const }
    const teams = [team('S1', 1), team('S2', 2), team('S3', 3)]
    expect(() => generaTorneo(t, teams)).toThrow(/potenza di 2/i)
  })
})
