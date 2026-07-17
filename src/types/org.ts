export interface OrgRecord {
  codice: string
  doc: string
  version: number
  updatedAt: string
}

import type { Tournament, Team, Group, Match } from '../engine/types'

export type MatchStruct = Omit<Match, 'set' | 'vincitoreId' | 'stato'>

export interface OrgDoc {
  tournament: Tournament
  teams: Team[]
  groups: Group[]
  struttura: MatchStruct[]
}
