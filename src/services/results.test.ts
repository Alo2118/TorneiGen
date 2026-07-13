import { describe, it, expect } from 'vitest'
import { applicaRisultato, propagaTabellone } from './results'
import type { Match, RegolePunteggio } from '../engine/types'

const r: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

function tab(id: string, round: number, index: number, a: string | null, b: string | null): Match {
  return { id, tournamentId: 't1', fase: 'tabellone', round, posizioneTabellone: index, teamAId: a, teamBId: b, set: [], stato: 'programmata' }
}

describe('applicaRisultato', () => {
  it('imposta vincitore e stato conclusa quando completo', () => {
    const m = tab('m', 1, 0, 'A', 'B')
    const out = applicaRisultato(m, [{ puntiA: 21, puntiB: 15 }], r)
    expect(out.vincitoreId).toBe('A')
    expect(out.stato).toBe('conclusa')
  })
  it('resta in corso se incompleto', () => {
    const bo3: RegolePunteggio = { ...r, setAlMeglioDi: 3 }
    const m = tab('m', 1, 0, 'A', 'B')
    const out = applicaRisultato(m, [{ puntiA: 21, puntiB: 10 }], bo3)
    expect(out.vincitoreId == null).toBe(true)
    expect(out.stato).toBe('in_corso')
  })
})

describe('propagaTabellone', () => {
  it('fa avanzare i vincitori al round successivo', () => {
    const semi1 = { ...tab('s1', 1, 0, 'A', 'B'), set: [{ puntiA: 21, puntiB: 15 }], vincitoreId: 'A', stato: 'conclusa' as const }
    const semi2 = { ...tab('s2', 1, 1, 'C', 'D'), set: [{ puntiA: 21, puntiB: 12 }], vincitoreId: 'C', stato: 'conclusa' as const }
    const finale = tab('f', 2, 0, null, null)
    const out = propagaTabellone([semi1, semi2, finale], r)
    const f = out.find((m) => m.id === 'f')!
    expect(f.teamAId).toBe('A')
    expect(f.teamBId).toBe('C')
  })
  it('ricalcola correttamente dopo la modifica di un risultato', () => {
    const semi1 = { ...tab('s1', 1, 0, 'A', 'B'), set: [{ puntiA: 15, puntiB: 21 }], vincitoreId: 'B', stato: 'conclusa' as const }
    const semi2 = { ...tab('s2', 1, 1, 'C', 'D'), set: [{ puntiA: 21, puntiB: 12 }], vincitoreId: 'C', stato: 'conclusa' as const }
    const finale = { ...tab('f', 2, 0, 'A', 'C'), } // conteneva il vecchio vincitore A
    const out = propagaTabellone([semi1, semi2, finale], r)
    const f = out.find((m) => m.id === 'f')!
    expect(f.teamAId).toBe('B') // ricalcolato dal nuovo risultato
  })
  it('azzera lo slot a valle se il risultato a monte torna incompleto', () => {
    const semi1 = tab('s1', 1, 0, 'A', 'B') // set: [], nessun vincitore
    const semi2 = { ...tab('s2', 1, 1, 'C', 'D'), set: [{ puntiA: 21, puntiB: 12 }], vincitoreId: 'C', stato: 'conclusa' as const }
    const finale = { ...tab('f', 2, 0, 'A', 'C') } // stale: conteneva 'A' da una propagazione precedente
    const out = propagaTabellone([semi1, semi2, finale], r)
    const f = out.find((m) => m.id === 'f')!
    expect(f.teamAId).toBeNull() // ripulito perché semi1 non ha più un vincitore
    expect(f.teamBId).toBe('C') // semi2 resta propagato
  })
})
