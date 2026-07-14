import type { DoubleBracketMatch } from './types'
import { generateSingleElimination } from './bracket'

export function generateDoubleElimination(teamIds: string[]): DoubleBracketMatch[] {
  if (teamIds.length < 2) return []
  const wbRaw = generateSingleElimination(teamIds)
  const R = Math.max(...wbRaw.map((m) => m.round))
  const wbId = (id: string) => id.replace(/^m-/, 'wb-')

  const wb: DoubleBracketMatch[] = wbRaw.map((m) => ({
    id: wbId(m.id),
    tabelloneTipo: 'vincenti',
    round: m.round,
    index: m.index,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    winnerFeeds: m.feedsMatchId ? { matchId: wbId(m.feedsMatchId), slot: m.feedsSlot as 'A' | 'B' } : null,
    loserFeeds: null,
  }))
  const wbRound = (r: number) => wb.filter((m) => m.round === r).sort((a, b) => a.index - b.index)

  const lb: DoubleBracketMatch[] = []
  const mkLb = (round: number, index: number): DoubleBracketMatch => {
    const m: DoubleBracketMatch = {
      id: `lb-r${round}-i${index}`, tabelloneTipo: 'perdenti', round, index,
      teamAId: null, teamBId: null, winnerFeeds: null, loserFeeds: null,
    }
    lb.push(m)
    return m
  }

  let lbRound = 0
  let prev: DoubleBracketMatch[] = []

  for (let r = 1; r <= R - 1; r++) {
    // fase dispari: r===1 primo innesto (perdenti WB R1 a coppie); r>1 consolidamento (prev a coppie)
    lbRound++
    const dispari: DoubleBracketMatch[] = []
    if (r === 1) {
      const wb1 = wbRound(1)
      for (let j = 0; j < wb1.length / 2; j++) {
        const m = mkLb(lbRound, j); dispari.push(m)
        wb1[2 * j].loserFeeds = { matchId: m.id, slot: 'A' }
        wb1[2 * j + 1].loserFeeds = { matchId: m.id, slot: 'B' }
      }
    } else {
      for (let j = 0; j < prev.length / 2; j++) {
        const m = mkLb(lbRound, j); dispari.push(m)
        prev[2 * j].winnerFeeds = { matchId: m.id, slot: 'A' }
        prev[2 * j + 1].winnerFeeds = { matchId: m.id, slot: 'B' }
      }
    }
    prev = dispari

    // fase pari: innesto dei perdenti del WB round (r+1) contro i sopravvissuti LB
    lbRound++
    const pari: DoubleBracketMatch[] = []
    const drop = wbRound(r + 1)
    for (let j = 0; j < prev.length; j++) {
      const m = mkLb(lbRound, j); pari.push(m)
      prev[j].winnerFeeds = { matchId: m.id, slot: 'A' }
      drop[j].loserFeeds = { matchId: m.id, slot: 'B' }
    }
    prev = pari
  }

  // finale singola
  const gf: DoubleBracketMatch = {
    id: 'gf', tabelloneTipo: 'finale', round: 1, index: 0,
    teamAId: null, teamBId: null, winnerFeeds: null, loserFeeds: null,
  }
  const wbFinal = wb.find((m) => m.round === R)!
  wbFinal.winnerFeeds = { matchId: 'gf', slot: 'A' }
  if (prev.length > 0) {
    prev[0].winnerFeeds = { matchId: 'gf', slot: 'B' }
  } else {
    // N=2: nessun tabellone perdenti — il perdente del WB va direttamente in finale
    wbFinal.loserFeeds = { matchId: 'gf', slot: 'B' }
  }

  return [...wb, ...lb, gf]
}
