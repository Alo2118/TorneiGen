import type { Match, SetScore, RegolePunteggio } from '../engine/types'
import { matchOutcome } from '../engine/matchOutcome'

export function applicaRisultato(match: Match, set: SetScore[], regole: RegolePunteggio): Match {
  const o = matchOutcome(set, regole)
  const vincitoreId = o.vincitore === 'A' ? match.teamAId : o.vincitore === 'B' ? match.teamBId : null
  return {
    ...match,
    set,
    vincitoreId,
    stato: o.completa ? 'conclusa' : set.length > 0 ? 'in_corso' : 'programmata',
  }
}

export function propagaTabellone(matches: Match[], regole: RegolePunteggio): Match[] {
  const tabellone = matches.filter((m) => m.fase === 'tabellone')
  if (tabellone.length === 0) return matches

  // mappa per (round,index); lavoriamo su copie mutabili
  const byId = new Map(tabellone.map((m) => [m.id, { ...m }]))
  const lista = [...byId.values()]
  const maxRound = Math.max(...lista.map((m) => m.round))

  // azzera gli slot dei round > 1 prima di ricalcolare
  for (const m of lista) {
    if (m.round > 1) { m.teamAId = null; m.teamBId = null }
  }

  const key = (round: number, index: number) => lista.find((m) => m.round === round && m.posizioneTabellone === index)

  for (let round = 1; round < maxRound; round++) {
    const correnti = lista.filter((m) => m.round === round).sort((a, b) => (a.posizioneTabellone ?? 0) - (b.posizioneTabellone ?? 0))
    for (const m of correnti) {
      const idx = m.posizioneTabellone ?? 0
      const succ = key(round + 1, Math.floor(idx / 2))
      if (!succ) continue
      const o = matchOutcome(m.set, regole)
      let vincitore = o.vincitore === 'A' ? m.teamAId : o.vincitore === 'B' ? m.teamBId : null
      if (vincitore == null && m.round === 1) {
        // bye: al round 1 uno slot vuoto e l'altro pieno avanza automaticamente
        const soloA = m.teamAId !== null && m.teamBId === null
        const soloB = m.teamBId !== null && m.teamAId === null
        if (soloA) vincitore = m.teamAId
        else if (soloB) vincitore = m.teamBId
      }
      if (vincitore == null) continue
      if (idx % 2 === 0) succ.teamAId = vincitore
      else succ.teamBId = vincitore
    }
  }

  // ricompone: match non-tabellone invariati + tabellone aggiornato
  const aggiornati = new Map(lista.map((m) => [m.id, m]))
  return matches.map((m) => aggiornati.get(m.id) ?? m)
}

export function propagaDoppia(matches: Match[], regole: RegolePunteggio): Match[] {
  const tab = matches.filter((m) => m.fase === 'tabellone')
  if (tab.length === 0) return matches
  const byId = new Map(tab.map((m) => [m.id, { ...m }]))

  // slot alimentati da un feed (da azzerare prima del ricalcolo)
  const target = new Set<string>()
  for (const m of byId.values()) {
    if (m.vincitoreVerso) target.add(`${m.vincitoreVerso.matchId}:${m.vincitoreVerso.slot}`)
    if (m.perdenteVerso) target.add(`${m.perdenteVerso.matchId}:${m.perdenteVerso.slot}`)
  }
  for (const m of byId.values()) {
    if (target.has(`${m.id}:A`)) m.teamAId = null
    if (target.has(`${m.id}:B`)) m.teamBId = null
  }

  const peso = (m: Match) =>
    (m.tabelloneTipo === 'vincenti' ? 0 : m.tabelloneTipo === 'perdenti' ? 1 : 2) * 100000 +
    (m.round ?? 0) * 1000 + (m.posizioneTabellone ?? 0)
  const lista = [...byId.values()].sort((a, b) => peso(a) - peso(b))

  const metti = (ref: { matchId: string; slot: 'A' | 'B' } | null | undefined, team: string | null) => {
    if (!ref || !team) return
    const t = byId.get(ref.matchId)
    if (!t) return
    if (ref.slot === 'A') t.teamAId = team
    else t.teamBId = team
  }

  for (const m of lista) {
    const o = matchOutcome(m.set, regole)
    if (!o.completa) continue
    const vincitore = o.vincitore === 'A' ? m.teamAId : m.teamBId
    const perdente = o.vincitore === 'A' ? m.teamBId : m.teamAId
    metti(m.vincitoreVerso, vincitore)
    metti(m.perdenteVerso, perdente)
  }

  // golden set: si gioca solo se la finale la vince il campione perdenti (slot B)
  const gf = byId.get('gf')
  const golden = byId.get('golden')
  if (gf && golden) {
    golden.teamAId = null
    golden.teamBId = null
    const oGf = matchOutcome(gf.set, regole)
    if (oGf.completa && oGf.vincitore === 'B') {
      golden.teamAId = gf.teamAId
      golden.teamBId = gf.teamBId
    }
  }

  const agg = new Map([...byId.values()].map((m) => [m.id, m]))
  return matches.map((m) => agg.get(m.id) ?? m)
}
