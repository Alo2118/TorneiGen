import type { Group, Match, RegolePunteggio, StandingRow } from '../engine/types'
import { computeStandings } from '../engine/standings'

export function classificaGirone(group: Group, matches: Match[], regole: RegolePunteggio): StandingRow[] {
  const delGirone = matches.filter((m) => m.groupId === group.id)
  return computeStandings(group.teamIds, delGirone, regole)
}
