import type { Match } from './types'

export type TabelloneTipo = NonNullable<Match['tabelloneTipo']>

export const BOX_W = 200
export const BOX_H = 66
export const COL_GAP = 48
export const ROW_GAP = 16
export const BAND_GAP = 48
const COL_W = BOX_W + COL_GAP
const SLOT_H = BOX_H + ROW_GAP

export interface BracketNode {
  matchId: string
  round: number
  tabelloneTipo?: TabelloneTipo
  x: number
  y: number
  w: number
  h: number
}
export interface BracketSegment {
  from: string
  to: string
  tipo: 'avanza' | 'discesa'
}
export interface BracketLayout {
  nodi: BracketNode[]
  segmenti: BracketSegment[]
  campione: string | null
  campioneMatchId: string | null
  larghezza: number
  altezza: number
}

// il match che DECIDE il titolo (golden se giocato, altrimenti finale slot A / ultimo turno)
function matchCampione(tab: Match[]): string | null {
  if (tab.length === 0) return null
  const golden = tab.find((m) => m.tabelloneTipo === 'golden')
  if (golden?.vincitoreId) return golden.id
  const finale = tab.find((m) => m.tabelloneTipo === 'finale')
  if (finale) {
    return finale.stato === 'conclusa' && finale.vincitoreId && finale.vincitoreId === finale.teamAId
      ? finale.id
      : null
  }
  // la finalina 3°/4° posto non decide il titolo: escludila dal calcolo del campione
  const principali = tab.filter((m) => m.tabelloneTipo !== 'terzo')
  if (principali.length === 0) return null
  const maxRound = Math.max(...principali.map((m) => m.round))
  const ultima = principali.find((m) => m.round === maxRound)
  return ultima?.stato === 'conclusa' && ultima.vincitoreId ? ultima.id : null
}

export function campioneTorneo(matches: Match[]): string | null {
  const tab = matches.filter((m) => m.fase === 'tabellone')
  const id = matchCampione(tab)
  if (!id) return null
  return tab.find((m) => m.id === id)?.vincitoreId ?? null
}

export function layoutBracket(matches: Match[]): BracketLayout {
  const tab = matches.filter((m) => m.fase === 'tabellone')
  const campione = campioneTorneo(matches)
  const campioneMatchId = matchCampione(tab)
  if (tab.length === 0) return { nodi: [], segmenti: [], campione, campioneMatchId, larghezza: 0, altezza: 0 }
  // 'terzo' (finalina) è un box a sé nel tabellone singolo: non attiva il layout doppia
  const doppia = tab.some((m) => m.tabelloneTipo !== undefined && m.tabelloneTipo !== 'terzo')
  return doppia ? layoutDoppia(tab, campione, campioneMatchId) : layoutSingola(tab, campione, campioneMatchId)
}

function finalize(nodi: BracketNode[], segmenti: BracketSegment[], campione: string | null, campioneMatchId: string | null): BracketLayout {
  const larghezza = nodi.length ? Math.max(...nodi.map((n) => n.x)) + BOX_W : 0
  const altezza = nodi.length ? Math.max(...nodi.map((n) => n.y)) + BOX_H : 0
  return { nodi, segmenti, campione, campioneMatchId, larghezza, altezza }
}

function layoutSingola(tab: Match[], campione: string | null, campioneMatchId: string | null): BracketLayout {
  const terzo = tab.find((m) => m.tabelloneTipo === 'terzo')
  const albero = tab.filter((m) => m.tabelloneTipo !== 'terzo')
  const rounds = [...new Set(albero.map((m) => m.round))].sort((a, b) => a - b)
  const byRoundIndex = new Map<string, Match>()
  for (const m of albero) byRoundIndex.set(`${m.round}:${m.posizioneTabellone ?? 0}`, m)

  const nodi: BracketNode[] = []
  const yById = new Map<string, number>()
  for (const round of rounds) {
    const correnti = albero
      .filter((m) => m.round === round)
      .sort((a, b) => (a.posizioneTabellone ?? 0) - (b.posizioneTabellone ?? 0))
    correnti.forEach((m) => {
      const idx = m.posizioneTabellone ?? 0
      let y: number
      if (round === rounds[0]) {
        y = idx * SLOT_H
      } else {
        const figli = [
          byRoundIndex.get(`${round - 1}:${idx * 2}`),
          byRoundIndex.get(`${round - 1}:${idx * 2 + 1}`),
        ]
          .map((c) => (c ? yById.get(c.id) : undefined))
          .filter((v): v is number => v !== undefined)
        y = figli.length ? figli.reduce((s, v) => s + v, 0) / figli.length : idx * SLOT_H
      }
      yById.set(m.id, y)
      nodi.push({ matchId: m.id, round, x: (round - rounds[0]) * COL_W, y, w: BOX_W, h: BOX_H })
    })
  }

  const segmenti: BracketSegment[] = []
  for (const m of albero) {
    const parent = byRoundIndex.get(`${m.round + 1}:${Math.floor((m.posizioneTabellone ?? 0) / 2)}`)
    if (parent) segmenti.push({ from: m.id, to: parent.id, tipo: 'avanza' })
  }
  // finalina 3°/4° posto: box isolato sotto l'ultima colonna, senza collegamenti
  if (terzo) {
    const maxX = nodi.length ? Math.max(...nodi.map((n) => n.x)) : 0
    const maxY = nodi.length ? Math.max(...nodi.map((n) => n.y)) : 0
    nodi.push({ matchId: terzo.id, round: 0, tabelloneTipo: 'terzo', x: maxX, y: maxY + SLOT_H * 2, w: BOX_W, h: BOX_H })
  }
  return finalize(nodi, segmenti, campione, campioneMatchId)
}

function layoutDoppia(tab: Match[], campione: string | null, campioneMatchId: string | null): BracketLayout {
  const finale = tab.find((m) => m.tabelloneTipo === 'finale')
  const golden = tab.find((m) => m.tabelloneTipo === 'golden')

  const nodi: BracketNode[] = []
  const yById = new Map<string, number>()

  const disponiBanda = (band: Match[], baseY: number) => {
    const rounds = [...new Set(band.map((m) => m.round))].sort((a, b) => a - b)
    for (const round of rounds) {
      const correnti = band
        .filter((m) => m.round === round)
        .sort((a, b) => (a.posizioneTabellone ?? 0) - (b.posizioneTabellone ?? 0))
      correnti.forEach((m, i) => {
        const feeders = band.filter((f) => f.vincitoreVerso?.matchId === m.id)
        const ys = feeders.map((f) => yById.get(f.id)).filter((v): v is number => v !== undefined)
        const y = round === rounds[0] || ys.length === 0
          ? baseY + i * SLOT_H
          : ys.reduce((s, v) => s + v, 0) / ys.length
        yById.set(m.id, y)
        nodi.push({ matchId: m.id, round, tabelloneTipo: m.tabelloneTipo, x: (round - 1) * COL_W, y, w: BOX_W, h: BOX_H })
      })
    }
  }

  disponiBanda(tab.filter((m) => m.tabelloneTipo === 'vincenti'), 0)
  const wbAltezza = nodi.length ? Math.max(...nodi.map((n) => n.y)) + BOX_H : 0
  disponiBanda(tab.filter((m) => m.tabelloneTipo === 'perdenti'), wbAltezza + BAND_GAP)

  const bande = tab.filter((m) => m.tabelloneTipo === 'vincenti' || m.tabelloneTipo === 'perdenti')
  const colFinale = bande.length ? Math.max(...bande.map((m) => m.round)) : 1
  const altezzaTot = nodi.length ? Math.max(...nodi.map((n) => n.y)) + BOX_H : BOX_H
  const yFinale = (altezzaTot - BOX_H) / 2

  if (finale) {
    yById.set(finale.id, yFinale)
    nodi.push({ matchId: finale.id, round: 1, tabelloneTipo: 'finale', x: colFinale * COL_W, y: yFinale, w: BOX_W, h: BOX_H })
  }
  if (golden) {
    nodi.push({ matchId: golden.id, round: 1, tabelloneTipo: 'golden', x: colFinale * COL_W, y: yFinale + SLOT_H, w: BOX_W, h: BOX_H })
  }

  const segmenti: BracketSegment[] = []
  for (const m of tab) {
    if (m.vincitoreVerso) segmenti.push({ from: m.id, to: m.vincitoreVerso.matchId, tipo: 'avanza' })
    if (m.perdenteVerso) segmenti.push({ from: m.id, to: m.perdenteVerso.matchId, tipo: 'discesa' })
  }
  if (finale && golden) segmenti.push({ from: finale.id, to: golden.id, tipo: 'avanza' })

  return finalize(nodi, segmenti, campione, campioneMatchId)
}
