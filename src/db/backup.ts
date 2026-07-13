import { db } from './database'
import type { Tournament, Team, Group, Match } from '../engine/types'

export interface BackupData {
  tournament: Tournament
  teams: Team[]
  groups: Group[]
  matches: Match[]
}

export async function exportBackup(tournamentId: string): Promise<BackupData> {
  const tournament = await db.tournaments.get(tournamentId)
  if (!tournament) throw new Error(`Torneo ${tournamentId} non trovato`)
  const [teams, groups, matches] = await Promise.all([
    db.teams.where('tournamentId').equals(tournamentId).toArray(),
    db.groups.where('tournamentId').equals(tournamentId).toArray(),
    db.matches.where('tournamentId').equals(tournamentId).toArray(),
  ])
  return { tournament, teams, groups, matches }
}

export async function importBackup(data: BackupData): Promise<void> {
  await db.transaction('rw', db.tournaments, db.teams, db.groups, db.matches, async () => {
    await db.tournaments.put(data.tournament)
    await db.teams.bulkPut(data.teams)
    await db.groups.bulkPut(data.groups)
    await db.matches.bulkPut(data.matches)
  })
}
