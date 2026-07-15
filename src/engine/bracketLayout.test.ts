import { describe, it, expect } from 'vitest'
import { layoutBracket, campioneTorneo, BOX_W, BOX_H } from './bracketLayout'
import type { Match } from './types'

function md(p: Partial<Match> & { id: string }): Match {
  return {
    tournamentId: 't', fase: 'tabellone', round: 1, teamAId: null, teamBId: null,
    set: [], stato: 'programmata', ...p,
  }
}

describe('campioneTorneo', () => {
  it('diretta: vincitore dell\'ultimo round', () => {
    const m = [
      md({ id: 'a', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', vincitoreId: 'A', stato: 'conclusa' }),
      md({ id: 'b', round: 1, posizioneTabellone: 1, teamAId: 'C', teamBId: 'D', vincitoreId: 'C', stato: 'conclusa' }),
      md({ id: 'f', round: 2, posizioneTabellone: 0, teamAId: 'A', teamBId: 'C', vincitoreId: 'A', stato: 'conclusa' }),
    ]
    expect(campioneTorneo(m)).toBe('A')
  })
  it('doppia: se vince lo slot A della finale è campione', () => {
    const m = [md({ id: 't:gf', tabelloneTipo: 'finale', teamAId: 'W', teamBId: 'L', vincitoreId: 'W', stato: 'conclusa' })]
    expect(campioneTorneo(m)).toBe('W')
  })
  it('doppia: se vince lo slot B (perdenti) e il golden non è giocato, nessun campione', () => {
    const m = [md({ id: 't:gf', tabelloneTipo: 'finale', teamAId: 'W', teamBId: 'L', vincitoreId: 'L', stato: 'conclusa' })]
    expect(campioneTorneo(m)).toBeNull()
  })
  it('doppia: vincitore del golden è campione', () => {
    const m = [
      md({ id: 't:gf', tabelloneTipo: 'finale', teamAId: 'W', teamBId: 'L', vincitoreId: 'L', stato: 'conclusa' }),
      md({ id: 't:golden', tabelloneTipo: 'golden', teamAId: 'W', teamBId: 'L', vincitoreId: 'L', stato: 'conclusa' }),
    ]
    expect(campioneTorneo(m)).toBe('L')
  })
})

describe('layoutBracket.campioneMatchId', () => {
  it('quando il golden decide, il match campione è il golden (non la finale)', () => {
    const m = [
      md({ id: 't:gf', tabelloneTipo: 'finale', teamAId: 'W', teamBId: 'L', vincitoreId: 'L', stato: 'conclusa' }),
      md({ id: 't:golden', tabelloneTipo: 'golden', teamAId: 'W', teamBId: 'L', vincitoreId: 'L', stato: 'conclusa' }),
    ]
    expect(layoutBracket(m).campioneMatchId).toBe('t:golden')
  })
  it('senza golden, se vince lo slot A il match campione è la finale', () => {
    const m = [md({ id: 't:gf', tabelloneTipo: 'finale', teamAId: 'W', teamBId: 'L', vincitoreId: 'W', stato: 'conclusa' })]
    expect(layoutBracket(m).campioneMatchId).toBe('t:gf')
  })
})

describe('layoutBracket — eliminazione diretta', () => {
  const m = [
    md({ id: 'a', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B' }),
    md({ id: 'b', round: 1, posizioneTabellone: 1, teamAId: 'C', teamBId: 'D' }),
    md({ id: 'f', round: 2, posizioneTabellone: 0 }),
  ]
  it('crea un nodo per partita con dimensioni fisse', () => {
    const l = layoutBracket(m)
    expect(l.nodi).toHaveLength(3)
    expect(l.nodi.every((n) => n.w === BOX_W && n.h === BOX_H)).toBe(true)
  })
  it('colonne per round: round 1 a x=0, round 2 più a destra', () => {
    const l = layoutBracket(m)
    expect(l.nodi.find((n) => n.matchId === 'a')!.x).toBe(0)
    expect(l.nodi.find((n) => n.matchId === 'f')!.x).toBeGreaterThan(0)
  })
  it('la finale è centrata verticalmente tra i due match che la alimentano', () => {
    const l = layoutBracket(m)
    const ya = l.nodi.find((n) => n.matchId === 'a')!.y
    const yb = l.nodi.find((n) => n.matchId === 'b')!.y
    const yf = l.nodi.find((n) => n.matchId === 'f')!.y
    expect(yf).toBeCloseTo((ya + yb) / 2)
  })
  it('un segmento di avanzamento da ogni match del round 1 alla finale', () => {
    const l = layoutBracket(m)
    const avanza = l.segmenti.filter((s) => s.tipo === 'avanza')
    expect(avanza).toEqual(
      expect.arrayContaining([
        { from: 'a', to: 'f', tipo: 'avanza' },
        { from: 'b', to: 'f', tipo: 'avanza' },
      ]),
    )
  })
})

describe('layoutBracket — doppia eliminazione', () => {
  // 4 squadre: WB(a,b -> wbf), LB(lb1 -> lb2), finale gf, golden
  const m = [
    md({ id: 't:wb-r1-i0', tabelloneTipo: 'vincenti', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', vincitoreVerso: { matchId: 't:wb-r2-i0', slot: 'A' }, perdenteVerso: { matchId: 't:lb-r1-i0', slot: 'A' } }),
    md({ id: 't:wb-r1-i1', tabelloneTipo: 'vincenti', round: 1, posizioneTabellone: 1, teamAId: 'C', teamBId: 'D', vincitoreVerso: { matchId: 't:wb-r2-i0', slot: 'B' }, perdenteVerso: { matchId: 't:lb-r1-i0', slot: 'B' } }),
    md({ id: 't:wb-r2-i0', tabelloneTipo: 'vincenti', round: 2, posizioneTabellone: 0, vincitoreVerso: { matchId: 't:gf', slot: 'A' }, perdenteVerso: { matchId: 't:lb-r2-i0', slot: 'B' } }),
    md({ id: 't:lb-r1-i0', tabelloneTipo: 'perdenti', round: 1, posizioneTabellone: 0, vincitoreVerso: { matchId: 't:lb-r2-i0', slot: 'A' } }),
    md({ id: 't:lb-r2-i0', tabelloneTipo: 'perdenti', round: 2, posizioneTabellone: 0, vincitoreVerso: { matchId: 't:gf', slot: 'B' } }),
    md({ id: 't:gf', tabelloneTipo: 'finale', round: 1, posizioneTabellone: 0 }),
    md({ id: 't:golden', tabelloneTipo: 'golden', round: 1, posizioneTabellone: 0 }),
  ]
  it('un nodo per partita (7)', () => {
    expect(layoutBracket(m).nodi).toHaveLength(7)
  })
  it('la banda perdenti sta sotto la banda vincenti', () => {
    const l = layoutBracket(m)
    const maxWb = Math.max(...l.nodi.filter((n) => n.tabelloneTipo === 'vincenti').map((n) => n.y))
    const minLb = Math.min(...l.nodi.filter((n) => n.tabelloneTipo === 'perdenti').map((n) => n.y))
    expect(minLb).toBeGreaterThan(maxWb)
  })
  it('segmenti: avanzamento per i vincitoreVerso e discesa per i perdenteVerso', () => {
    const l = layoutBracket(m)
    expect(l.segmenti).toEqual(
      expect.arrayContaining([
        { from: 't:wb-r1-i0', to: 't:wb-r2-i0', tipo: 'avanza' },
        { from: 't:wb-r1-i0', to: 't:lb-r1-i0', tipo: 'discesa' },
        { from: 't:gf', to: 't:golden', tipo: 'avanza' },
      ]),
    )
  })
})
