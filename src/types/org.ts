export interface OrgRecord {
  codice: string
  doc: string
  version: number
  updatedAt: string
  societaId?: string | null
}

import type { Tournament, Team, Group, Match, SetScore } from '../engine/types'

export type MatchStruct = Omit<Match, 'set' | 'vincitoreId' | 'stato'>

// Risultato di una partita, sincronizzato a parte dalla struttura.
export interface RisultatoStruct {
  id: string
  set: SetScore[]
  vincitoreId?: string | null
  stato: Match['stato']
}

export interface OrgDoc {
  tournament: Tournament
  teams: Team[]
  groups: Group[]
  struttura: MatchStruct[]
  risultati?: RisultatoStruct[]
}
