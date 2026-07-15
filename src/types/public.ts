import type { Match, RegolePunteggio, Tipologia } from '../engine/types'

export interface PublicTeam {
  id: string
  nome: string
}
export interface PublicGroup {
  id: string
  nome: string
  teamIds: string[]
}
export interface PublicSnapshot {
  codice: string
  nome: string
  tipologia: Tipologia
  formato: string | null
  faseFinale?: 'diretta' | 'doppia'
  qualificatiPerGirone?: number | 'tutti'
  regolePunteggio: RegolePunteggio
  updatedAt: string
  teams: PublicTeam[]
  groups: PublicGroup[]
  matches: Match[]
  giornate?: { data: string; inizio: string; fine: string }[]
  numeroCampi?: number
  durataPartitaMin?: number
}
