import { describe, it, expect } from 'vitest'
import { prossimoPasso } from './prossimoPasso'
import type { Tournament, Team } from '../engine/types'

const t: Tournament = {
  id: 't1', nome: 'C', tipologia: '2x2', formato: 'girone_italiana', data: '2026-09-01', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'A',
}
const team = (id: string, stato: 'in_attesa' | 'confermata'): Team => ({ id, tournamentId: 't1', nome: id, players: [], stato, origine: 'manuale' })

describe('prossimoPasso', () => {
  it('nessuna squadra → aggiungi squadre', () => {
    expect(prossimoPasso(t, [], []).azione).toBe('squadre')
  })
  it('squadre in attesa → conferma', () => {
    expect(prossimoPasso(t, [team('a', 'in_attesa')], []).azione).toBe('conferma')
  })
  it('abbastanza confermate, nessun match → genera', () => {
    expect(prossimoPasso(t, [team('a', 'confermata'), team('b', 'confermata')], []).azione).toBe('genera')
  })
  it('match presenti → punteggi', () => {
    const m = { id: 'm', tournamentId: 't1', fase: 'girone' as const, round: 1, teamAId: 'a', teamBId: 'b', set: [], stato: 'programmata' as const }
    expect(prossimoPasso(t, [team('a', 'confermata'), team('b', 'confermata')], [m]).azione).toBe('punteggi')
  })
})
