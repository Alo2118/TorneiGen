import { describe, it, expect } from 'vitest'
import { classificaGirone } from './standings'
import type { Group, Match, RegolePunteggio } from '../engine/types'

const r: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

describe('classificaGirone', () => {
  it('classificaGirone ordina per vittorie', () => {
    const g: Group = { id: 'g1', tournamentId: 't1', nome: 'A', teamIds: ['A', 'B'] }
    const m: Match = { id: 'm', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 10 }], vincitoreId: 'A', stato: 'conclusa' }
    const rows = classificaGirone(g, [m], r)
    expect(rows[0].teamId).toBe('A')
  })
})
