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
