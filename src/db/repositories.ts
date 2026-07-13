import { db } from './database'
import type { Tournament, Team, Group, Match } from '../engine/types'

export const listTournaments = (): Promise<Tournament[]> => db.tournaments.toArray()
export const getTournament = (id: string): Promise<Tournament | undefined> => db.tournaments.get(id)
export const saveTournament = async (t: Tournament): Promise<void> => { await db.tournaments.put(t) }

export const teamsOf = (tournamentId: string): Promise<Team[]> =>
  db.teams.where('tournamentId').equals(tournamentId).toArray()
export const groupsOf = (tournamentId: string): Promise<Group[]> =>
  db.groups.where('tournamentId').equals(tournamentId).toArray()
export const matchesOf = (tournamentId: string): Promise<Match[]> =>
  db.matches.where('tournamentId').equals(tournamentId).toArray()
export const matchesOfGroup = (groupId: string): Promise<Match[]> =>
  db.matches.where('groupId').equals(groupId).toArray()

export async function replaceGenerated(
  tournamentId: string,
  groups: Group[],
  matches: Match[],
): Promise<void> {
  await db.transaction('rw', db.groups, db.matches, async () => {
    await db.groups.where('tournamentId').equals(tournamentId).delete()
    await db.matches.where('tournamentId').equals(tournamentId).delete()
    if (groups.length) await db.groups.bulkPut(groups)
    if (matches.length) await db.matches.bulkPut(matches)
  })
}
