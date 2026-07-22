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
  // Timestamp ISO dell'ultima modifica del risultato: consente il merge by-time
  // e i tombstone (annullamenti) che convergono tra dispositivi.
  risultatoAggiornatoAl?: string
}

export interface OrgDoc {
  tournament: Tournament
  teams: Team[]
  groups: Group[]
  struttura: MatchStruct[]
  risultati?: RisultatoStruct[]
}
