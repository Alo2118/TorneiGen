import { describe, it, expect } from 'vitest'
import { setWinner, matchOutcome, esitoGirone } from './matchOutcome'
import type { RegolePunteggio } from './types'

const bo1: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }
const bo3: RegolePunteggio = { setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

describe('setWinner', () => {
  it('vince A a 21-18', () => {
    expect(setWinner({ puntiA: 21, puntiB: 18 }, 21, true)).toBe('A')
  })
  it('nessun vincitore a 21-20 con vittoria a 2 di scarto', () => {
    expect(setWinner({ puntiA: 21, puntiB: 20 }, 21, true)).toBe(null)
  })
  it('vince B a 23-25 (oltre il target, +2)', () => {
    expect(setWinner({ puntiA: 23, puntiB: 25 }, 21, true)).toBe('B')
  })
  it('con cap, chiude a 1 di scarto se raggiunge il cap', () => {
    expect(setWinner({ puntiA: 22, puntiB: 21 }, 21, true, 22)).toBe('A')
  })
  it('senza vittoria a 2, chiude a 1 di scarto', () => {
    expect(setWinner({ puntiA: 21, puntiB: 20 }, 21, false)).toBe('A')
  })
})

describe('matchOutcome', () => {
  it('best of 1: 1 set deciso chiude la partita', () => {
    const o = matchOutcome([{ puntiA: 21, puntiB: 15 }], bo1)
    expect(o).toEqual({ vincitore: 'A', setA: 1, setB: 0, completa: true })
  })
  it('best of 3: vince chi arriva a 2 set', () => {
    const o = matchOutcome([{ puntiA: 21, puntiB: 10 }, { puntiA: 18, puntiB: 21 }, { puntiA: 15, puntiB: 11 }], bo3)
    expect(o.vincitore).toBe('A')
    expect(o.completa).toBe(true)
  })
  it('best of 3: il terzo set (spareggio) usa puntiTieBreak', () => {
    const o = matchOutcome([{ puntiA: 21, puntiB: 10 }, { puntiA: 10, puntiB: 21 }, { puntiA: 15, puntiB: 12 }], bo3)
    expect(o.vincitore).toBe('A')
  })
  it('partita incompleta se nessuno ha ancora i set necessari', () => {
    const o = matchOutcome([{ puntiA: 21, puntiB: 10 }], bo3)
    expect(o.completa).toBe(false)
    expect(o.vincitore).toBe(null)
  })
})

describe('esitoGirone (sempre 3 set)', () => {
  const s = (a: number, b: number) => ({ puntiA: a, puntiB: b })
  it('non è completa con meno di 3 set validi', () => {
    expect(esitoGirone([s(21, 15), s(21, 10)]).completa).toBe(false)
  })
  it('con 3 set: 2-1 conta i set e assegna il vincitore', () => {
    const o = esitoGirone([s(21, 15), s(10, 21), s(15, 12)])
    expect(o).toEqual({ vincitore: 'A', setA: 2, setB: 1, completa: true })
  })
  it('3-0 valido', () => {
    const o = esitoGirone([s(21, 5), s(21, 9), s(15, 3)])
    expect(o).toEqual({ vincitore: 'A', setA: 3, setB: 0, completa: true })
  })
  it('il terzo set usa il target 15 (tie-break): 14-12 non è ancora set valido', () => {
    const o = esitoGirone([s(21, 15), s(10, 21), s(14, 12)])
    expect(o.completa).toBe(false)
  })
})
