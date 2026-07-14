import type { Tournament, Team, Group, Match } from '../engine/types'
import { generateRoundRobin } from '../engine/roundRobin'
import { generateSingleElimination, resolveByes } from '../engine/bracket'
import { generateDoubleElimination } from '../engine/doubleElimination'
import { splitIntoGroups } from '../engine/groups'
import { newId } from '../engine/id'

export interface EsitoGenerazione {
  groups: Group[]
  matches: Match[]
}

const NUM_GIRONI_DEFAULT = 2

function matchGirone(t: Tournament, groupId: string, round: number, a: string | null, b: string | null): Match {
  return {
    id: newId(), tournamentId: t.id, fase: 'girone', groupId, round,
    teamAId: a, teamBId: b, set: [], stato: 'programmata',
  }
}

function roundRobinIntoGroup(t: Tournament, group: Group): Match[] {
  return generateRoundRobin(group.teamIds)
    .filter((p) => p.teamAId !== null && p.teamBId !== null) // salta i bye
    .map((p) => matchGirone(t, group.id, p.round, p.teamAId, p.teamBId))
}

function gironi(t: Tournament, teams: Team[], numeroGironi: number): EsitoGenerazione {
  const ids = [...teams].sort((a, b) => (a.testaDiSerie ?? 999) - (b.testaDiSerie ?? 999)).map((x) => x.id)
  const gruppiIds = splitIntoGroups(ids, numeroGironi)
  const groups: Group[] = gruppiIds.map((teamIds, i) => ({
    id: newId(), tournamentId: t.id, nome: `Girone ${String.fromCharCode(65 + i)}`, teamIds,
  }))
  const matches = groups.flatMap((g) => roundRobinIntoGroup(t, g))
  return { groups, matches }
}

function eliminazioneDiretta(t: Tournament, teams: Team[]): EsitoGenerazione {
  const ids = [...teams].sort((a, b) => (a.testaDiSerie ?? 999) - (b.testaDiSerie ?? 999)).map((x) => x.id)
  const bracket = resolveByes(generateSingleElimination(ids))
  const matches: Match[] = bracket.map((bm) => ({
    id: bm.id, tournamentId: t.id, fase: 'tabellone', round: bm.round,
    posizioneTabellone: bm.index, teamAId: bm.teamAId, teamBId: bm.teamBId,
    set: [], stato: 'programmata',
  }))
  return { groups: [], matches }
}

function isPotenzaDi2(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0
}

function eliminazioneDoppia(t: Tournament, teams: Team[]): EsitoGenerazione {
  if (!isPotenzaDi2(teams.length)) {
    throw new Error('L\'eliminazione doppia richiede un numero di squadre potenza di 2 (4, 8, 16, ...)')
  }
  const ids = [...teams].sort((a, b) => (a.testaDiSerie ?? 999) - (b.testaDiSerie ?? 999)).map((x) => x.id)
  const bracket = generateDoubleElimination(ids)
  const matches: Match[] = bracket.map((bm) => ({
    id: bm.id, tournamentId: t.id, fase: 'tabellone', tabelloneTipo: bm.tabelloneTipo,
    round: bm.round, posizioneTabellone: bm.index, teamAId: bm.teamAId, teamBId: bm.teamBId,
    set: [], stato: 'programmata',
    vincitoreVerso: bm.winnerFeeds, perdenteVerso: bm.loserFeeds,
  }))
  return { groups: [], matches }
}

export function generaTorneo(torneo: Tournament, teams: Team[]): EsitoGenerazione {
  switch (torneo.formato) {
    case 'girone_italiana': {
      const group: Group = { id: newId(), tournamentId: torneo.id, nome: 'Girone unico', teamIds: teams.map((t) => t.id) }
      return { groups: [group], matches: roundRobinIntoGroup(torneo, group) }
    }
    case 'gironi_eliminazione':
      return gironi(torneo, teams, NUM_GIRONI_DEFAULT)
    case 'eliminazione_diretta':
      return eliminazioneDiretta(torneo, teams)
    case 'eliminazione_doppia':
      return eliminazioneDoppia(torneo, teams)
    case 'king_of_the_court':
      throw new Error('King of the Court non ancora disponibile')
    default:
      throw new Error(`Formato non gestito: ${torneo.formato}`)
  }
}
