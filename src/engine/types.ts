export type Tipologia = '2x2' | '4x4'

export type Formato =
  | 'gironi_eliminazione'
  | 'eliminazione_diretta'
  | 'eliminazione_doppia'
  | 'girone_italiana'
  | 'king_of_the_court'

export type StatoTorneo = 'bozza' | 'iscrizioni_aperte' | 'in_corso' | 'concluso'

export interface RegolePunteggio {
  setAlMeglioDi: 1 | 3
  puntiSet: number
  puntiTieBreak: number
  vittoriaConDue: boolean
  cap?: number
  gironiPerSet?: boolean
}

export interface Player {
  nome: string
  cognome: string
  email: string
  telefono: string
}

export interface Team {
  id: string
  tournamentId: string
  nome: string
  players: Player[]
  testaDiSerie?: number
  stato: 'in_attesa' | 'confermata'
  origine: 'online' | 'manuale'
}

export interface Group {
  id: string
  tournamentId: string
  nome: string
  teamIds: string[]
  tipo?: 'girone' | 'consolazione'
}

export interface SetScore {
  puntiA: number
  puntiB: number
}

export interface Match {
  id: string
  tournamentId: string
  fase: 'girone' | 'tabellone' | 'kotc'
  groupId?: string
  round: number
  posizioneTabellone?: number
  teamAId: string | null
  teamBId: string | null
  set: SetScore[]
  vincitoreId?: string | null
  stato: 'programmata' | 'in_corso' | 'conclusa'
  campo?: string
  orario?: string
  tabelloneTipo?: 'vincenti' | 'perdenti' | 'finale' | 'golden' | 'terzo'
  vincitoreVerso?: { matchId: string; slot: 'A' | 'B' } | null
  perdenteVerso?: { matchId: string; slot: 'A' | 'B' } | null
}

export interface Tournament {
  id: string
  nome: string
  tipologia: Tipologia
  formato: Formato
  data: string
  stato: StatoTorneo
  regolePunteggio: RegolePunteggio
  codiceIscrizione: string
  giornate?: { data: string; inizio: string; fine: string }[]
  numeroCampi?: number
  durataPartitaMin?: number
  faseFinale?: 'diretta' | 'doppia'
  qualificatiPerGirone?: number | 'tutti'
  finaleTerzoPosto?: boolean
  gironeConsolazione?: boolean
  pubblicato?: boolean
  orgVersion?: number
  orgPending?: boolean
}

// --- Tipi risultato del motore (indipendenti dalla persistenza) ---

export interface Pairing {
  round: number
  teamAId: string | null
  teamBId: string | null
}

export interface BracketMatch {
  id: string
  round: number
  index: number
  teamAId: string | null
  teamBId: string | null
  feedsMatchId: string | null
  feedsSlot: 'A' | 'B' | null
}

export interface DoubleBracketMatch {
  id: string
  tabelloneTipo: 'vincenti' | 'perdenti' | 'finale' | 'golden' | 'terzo'
  round: number
  index: number
  teamAId: string | null
  teamBId: string | null
  winnerFeeds: { matchId: string; slot: 'A' | 'B' } | null
  loserFeeds: { matchId: string; slot: 'A' | 'B' } | null
}

export interface StandingRow {
  teamId: string
  giocate: number
  vinte: number
  perse: number
  setVinti: number
  setPersi: number
  puntiFatti: number
  puntiSubiti: number
}
