import Dexie, { type Table } from 'dexie'
import type { Tournament, Team, Group, Match } from '../engine/types'

export class TorneiDB extends Dexie {
  tournaments!: Table<Tournament, string>
  teams!: Table<Team, string>
  groups!: Table<Group, string>
  matches!: Table<Match, string>

  constructor() {
    super('TorneiGen')
    this.version(1).stores({
      tournaments: 'id, stato, codiceIscrizione',
      teams: 'id, tournamentId, stato',
      groups: 'id, tournamentId',
      matches: 'id, tournamentId, groupId, fase, round',
    })
  }
}

export const db = new TorneiDB()
