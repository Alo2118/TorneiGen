import { describe, it, expect } from 'vitest'
import { applicaRisultato, propagaTabellone, propagaDoppia } from './results'
import { generaTorneo } from './generation'
import type { Match, RegolePunteggio, Tournament, Team } from '../engine/types'

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

describe('applicaRisultato con gironiPerSet', () => {
  const regoleSet: RegolePunteggio = { setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true, gironiPerSet: true }
  const matchBase = (fase: Match['fase']): Match => ({
    id: 'm', tournamentId: 't', fase, round: 1, teamAId: 'a', teamBId: 'b', set: [], stato: 'programmata',
  })
  const set3 = [{ puntiA: 21, puntiB: 15 }, { puntiA: 10, puntiB: 21 }, { puntiA: 15, puntiB: 12 }]

  it('girone: conclusa solo con 3 set', () => {
    const parziale = applicaRisultato(matchBase('girone'), set3.slice(0, 2), regoleSet)
    expect(parziale.stato).toBe('in_corso')
    const pieno = applicaRisultato(matchBase('girone'), set3, regoleSet)
    expect(pieno.stato).toBe('conclusa')
    expect(pieno.vincitoreId).toBe('a')
  })
  it('tabellone: resta best-of-3 (2-0 è già conclusa) anche con gironiPerSet', () => {
    const m = applicaRisultato(matchBase('tabellone'), [{ puntiA: 21, puntiB: 10 }, { puntiA: 21, puntiB: 12 }], regoleSet)
    expect(m.stato).toBe('conclusa')
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

  it('avanza automaticamente una squadra in bye del round 1 (nessun avversario, nessun set)', () => {
    const bye = tab('bye', 1, 0, 'A', null) // bye: slot B vuoto, nessun set giocato
    const reale = { ...tab('m2', 1, 1, 'C', 'D'), set: [{ puntiA: 21, puntiB: 12 }], vincitoreId: 'C', stato: 'conclusa' as const }
    const finale = tab('f', 2, 0, null, null)
    const out = propagaTabellone([bye, reale, finale], r)
    const f = out.find((m) => m.id === 'f')!
    expect(f.teamAId).toBe('A') // la squadra in bye avanza senza aver giocato
    expect(f.teamBId).toBe('C')
  })
})

describe('propagaTabellone integrazione con generaTorneo (bye reale)', () => {
  it('la squadra in bye resta nel tabellone dopo aver salvato il risultato del primo turno reale', () => {
    const torneo: Tournament = {
      id: 't1',
      nome: 'Torneo Test',
      tipologia: '2x2',
      formato: 'eliminazione_diretta',
      data: '2026-07-13',
      stato: 'in_corso',
      regolePunteggio: r,
      codiceIscrizione: 'ABC123',
    }
    const teams: Team[] = ['A', 'B', 'C'].map((nome, i) => ({
      id: nome,
      tournamentId: 't1',
      nome,
      players: [],
      testaDiSerie: i + 1,
      stato: 'confermata' as const,
      origine: 'manuale' as const,
    }))

    const { matches } = generaTorneo(torneo, teams)

    // con 3 squadre: un match reale al round 1 (due squadre) + un bye (una squadra sola)
    const round1 = matches.filter((m) => m.round === 1)
    const matchReale = round1.find((m) => m.teamAId !== null && m.teamBId !== null)!
    const matchBye = round1.find((m) => (m.teamAId === null) !== (m.teamBId === null))!
    expect(matchReale).toBeDefined()
    expect(matchBye).toBeDefined()
    const teamInBye = matchBye.teamAId ?? matchBye.teamBId

    // la squadra in bye deve già essere presente nella finale grazie alla generazione (resolveByes)
    const finalePreRisultato = matches.find((m) => m.round === 2)!
    expect([finalePreRisultato.teamAId, finalePreRisultato.teamBId]).toContain(teamInBye)

    // salva il risultato del match reale
    const matchAggiornato = applicaRisultato(matchReale, [{ puntiA: 21, puntiB: 15 }], r)
    const matchesConRisultato = matches.map((m) => (m.id === matchAggiornato.id ? matchAggiornato : m))

    const propagati = propagaTabellone(matchesConRisultato, r)
    const finale = propagati.find((m) => m.round === 2)!

    // la squadra in bye deve essere ancora presente nel tabellone dopo la propagazione
    expect([finale.teamAId, finale.teamBId]).toContain(teamInBye)
  })
})

function doppia(id: string, tipo: 'vincenti' | 'perdenti' | 'finale' | 'golden', round: number, index: number, a: string | null, b: string | null, vinc?: { matchId: string; slot: 'A' | 'B' } | null, perd?: { matchId: string; slot: 'A' | 'B' } | null): Match {
  return { id, tournamentId: 't1', fase: 'tabellone', tabelloneTipo: tipo, round, posizioneTabellone: index, teamAId: a, teamBId: b, set: [], stato: 'programmata', vincitoreVerso: vinc ?? null, perdenteVerso: perd ?? null }
}

describe('propagaDoppia', () => {
  it('il perdente di un match WB scende nello slot LB indicato', () => {
    const wb = { ...doppia('wb-r1-i0', 'vincenti', 1, 0, 'A', 'B', { matchId: 'wb-r2-i0', slot: 'A' }, { matchId: 'lb-r1-i0', slot: 'A' }), set: [{ puntiA: 21, puntiB: 10 }] }
    const lb = doppia('lb-r1-i0', 'perdenti', 1, 0, null, null)
    const wbf = doppia('wb-r2-i0', 'vincenti', 2, 0, null, null)
    const out = propagaDoppia([wb, lb, wbf], r)
    expect(out.find((m) => m.id === 'lb-r1-i0')!.teamAId).toBe('B') // B ha perso -> LB
    expect(out.find((m) => m.id === 'wb-r2-i0')!.teamAId).toBe('A') // A ha vinto -> WB
  })

  it('ri-modifica: cambiando il risultato, vincitore e perdente si ricollocano', () => {
    const wb = { ...doppia('wb-r1-i0', 'vincenti', 1, 0, 'A', 'B', { matchId: 'wb-r2-i0', slot: 'A' }, { matchId: 'lb-r1-i0', slot: 'A' }), set: [{ puntiA: 10, puntiB: 21 }] }
    const lb = { ...doppia('lb-r1-i0', 'perdenti', 1, 0, 'A', null), }
    const wbf = { ...doppia('wb-r2-i0', 'vincenti', 2, 0, 'A', null) }
    const out = propagaDoppia([wb, lb, wbf], r)
    expect(out.find((m) => m.id === 'lb-r1-i0')!.teamAId).toBe('A') // ora A ha perso
    expect(out.find((m) => m.id === 'wb-r2-i0')!.teamAId).toBe('B') // ora B ha vinto
  })
})

describe('propagaDoppia golden', () => {
  it('se il perdenti (slot B) vince la finale, si attiva il golden coi due finalisti', () => {
    const gf = { ...doppia('gf', 'finale', 1, 0, 'W', 'L'), set: [{ puntiA: 10, puntiB: 21 }] } // vince B (L, dal perdenti)
    const golden = doppia('golden', 'golden', 1, 0, null, null)
    const out = propagaDoppia([gf, golden], r)
    const g = out.find((m) => m.id === 'golden')!
    expect(g.teamAId).toBe('W')
    expect(g.teamBId).toBe('L')
  })
  it('se il vincenti (slot A) vince la finale, il golden resta vuoto', () => {
    const gf = { ...doppia('gf', 'finale', 1, 0, 'W', 'L'), set: [{ puntiA: 21, puntiB: 10 }] } // vince A (W)
    const golden = { ...doppia('golden', 'golden', 1, 0, 'X', 'Y') } // stato precedente sporco
    const out = propagaDoppia([gf, golden], r)
    const g = out.find((m) => m.id === 'golden')!
    expect(g.teamAId).toBeNull()
    expect(g.teamBId).toBeNull()
  })
  it('se la finale passa da slot B a slot A, il golden già giocato viene azzerato', () => {
    // finale ora vinta dal vincenti (slot A): il golden, prima giocato, deve tornare pulito
    const gf = { ...doppia('gf', 'finale', 1, 0, 'W', 'L'), set: [{ puntiA: 21, puntiB: 10 }] }
    const golden = {
      ...doppia('golden', 'golden', 1, 0, 'W', 'L'),
      set: [{ puntiA: 21, puntiB: 15 }],
      vincitoreId: 'W',
      stato: 'conclusa' as const,
    }
    const out = propagaDoppia([gf, golden], r)
    const g = out.find((m) => m.id === 'golden')!
    expect(g.teamAId).toBeNull()
    expect(g.teamBId).toBeNull()
    expect(g.set).toEqual([])
    expect(g.vincitoreId).toBeNull()
    expect(g.stato).toBe('programmata')
  })
})
