import type { Tournament, Team, Group, Match } from '../engine/types'
import type { OrgDoc, MatchStruct } from '../types/org'
import { db } from '../db/database'
import { getTournament, teamsOf, groupsOf, matchesOf } from '../db/repositories'

function strutturaDaMatch(m: Match): MatchStruct {
  const copia: Partial<Match> = { ...m }
  delete copia.set
  delete copia.vincitoreId
  delete copia.stato
  return copia as MatchStruct
}

export async function buildOrgDoc(tournamentId: string): Promise<OrgDoc> {
  const [t, teams, groups, matches] = await Promise.all([
    getTournament(tournamentId),
    teamsOf(tournamentId),
    groupsOf(tournamentId),
    matchesOf(tournamentId),
  ])
  if (!t) throw new Error('Torneo non trovato')
  const tournament: Tournament = { ...t, pubblicato: undefined, orgVersion: undefined, orgPending: undefined }
  return { tournament, teams, groups, struttura: matches.map(strutturaDaMatch) }
}

export interface StatoLocaleOrg {
  tournament: Tournament
  teams: Team[]
  groups: Group[]
  matches: Match[]
}

export function applyOrgDoc(
  doc: OrgDoc,
  localTournament: Tournament | undefined,
  localMatches: Match[],
): StatoLocaleOrg {
  const perId = new Map(localMatches.map((m) => [m.id, m]))
  const matches: Match[] = doc.struttura.map((s) => {
    const locale = perId.get(s.id)
    return {
      ...s,
      set: locale?.set ?? [],
      vincitoreId: locale?.vincitoreId ?? null,
      stato: locale?.stato ?? 'programmata',
    }
  })
  const tournament: Tournament = {
    ...doc.tournament,
    pubblicato: localTournament?.pubblicato,
    orgVersion: localTournament?.orgVersion,
    orgPending: localTournament?.orgPending,
  }
  return { tournament, teams: doc.teams, groups: doc.groups, matches }
}

export async function scriviOrgLocale(s: StatoLocaleOrg): Promise<void> {
  await db.transaction('rw', db.tournaments, db.teams, db.groups, db.matches, async () => {
    await db.tournaments.put(s.tournament)
    await db.teams.where('tournamentId').equals(s.tournament.id).delete()
    await db.groups.where('tournamentId').equals(s.tournament.id).delete()
    await db.matches.where('tournamentId').equals(s.tournament.id).delete()
    if (s.teams.length) await db.teams.bulkPut(s.teams)
    if (s.groups.length) await db.groups.bulkPut(s.groups)
    if (s.matches.length) await db.matches.bulkPut(s.matches)
  })
}
