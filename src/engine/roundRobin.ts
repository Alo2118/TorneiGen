import type { Pairing } from './types'

export function generateRoundRobin(teamIds: string[]): Pairing[] {
  const teams: (string | null)[] = [...teamIds]
  if (teams.length % 2 !== 0) teams.push(null) // bye
  const n = teams.length
  const rounds = n - 1
  const half = n / 2
  const arr = [...teams]
  const result: Pairing[] = []

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      result.push({
        round: r + 1,
        teamAId: arr[i],
        teamBId: arr[n - 1 - i],
      })
    }
    // rotazione: primo fisso, gli altri ruotano
    const fixed = arr[0]
    const rest = arr.slice(1)
    rest.unshift(rest.pop() as string | null)
    arr.splice(0, arr.length, fixed, ...rest)
  }
  return result
}
