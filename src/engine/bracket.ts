import type { BracketMatch } from './types'

function prossimaPotenzaDi2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

// Ordine standard delle teste di serie per gli slot del tabellone.
function seedPositions(size: number): number[] {
  let pos = [1, 2]
  while (pos.length < size) {
    const sum = pos.length * 2 + 1
    const next: number[] = []
    for (const p of pos) {
      next.push(p)
      next.push(sum - p)
    }
    pos = next
  }
  return pos
}

export function generateSingleElimination(teamIds: string[]): BracketMatch[] {
  const n = teamIds.length
  if (n < 2) return []
  const size = prossimaPotenzaDi2(n)
  const slots = seedPositions(size).map((seed) => teamIds[seed - 1] ?? null)
  const totRound = Math.log2(size)
  const matches: BracketMatch[] = []

  // id deterministico
  const mid = (round: number, index: number) => `m-r${round}-i${index}`

  // Round 1
  for (let i = 0; i < size / 2; i++) {
    matches.push({
      id: mid(1, i),
      round: 1,
      index: i,
      teamAId: slots[i * 2],
      teamBId: slots[i * 2 + 1],
      feedsMatchId: totRound >= 2 ? mid(2, Math.floor(i / 2)) : null,
      feedsSlot: totRound >= 2 ? (i % 2 === 0 ? 'A' : 'B') : null,
    })
  }

  // Round successivi
  for (let round = 2; round <= totRound; round++) {
    const count = size / Math.pow(2, round)
    for (let i = 0; i < count; i++) {
      const isFinale = round === totRound
      matches.push({
        id: mid(round, i),
        round,
        index: i,
        teamAId: null,
        teamBId: null,
        feedsMatchId: isFinale ? null : mid(round + 1, Math.floor(i / 2)),
        feedsSlot: isFinale ? null : i % 2 === 0 ? 'A' : 'B',
      })
    }
  }

  return matches
}

export function advanceWinner(
  bracket: BracketMatch[],
  matchId: string,
  winnerId: string,
): BracketMatch[] {
  const m = bracket.find((x) => x.id === matchId)
  if (!m || !m.feedsMatchId) return bracket
  return bracket.map((x) => {
    if (x.id !== m.feedsMatchId) return x
    return m.feedsSlot === 'A' ? { ...x, teamAId: winnerId } : { ...x, teamBId: winnerId }
  })
}

export function resolveByes(bracket: BracketMatch[]): BracketMatch[] {
  let result = bracket
  for (const m of bracket.filter((x) => x.round === 1)) {
    const soloA = m.teamAId !== null && m.teamBId === null
    const soloB = m.teamBId !== null && m.teamAId === null
    if (soloA) result = advanceWinner(result, m.id, m.teamAId as string)
    else if (soloB) result = advanceWinner(result, m.id, m.teamBId as string)
  }
  return result
}
