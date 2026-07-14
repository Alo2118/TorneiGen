import type { Iscrizione } from '../types/registrations'
import type { Team } from '../engine/types'
import { newId } from '../engine/id'

export function iscrizioneATeam(iscr: Iscrizione, tournamentId: string): Team {
  return {
    id: newId(),
    tournamentId,
    nome: iscr.nomeSquadra,
    players: iscr.giocatori.map((g) => ({ nome: g.nome, cognome: g.cognome, email: g.email, telefono: g.telefono })),
    stato: 'in_attesa',
    origine: 'online',
  }
}

export function nuoveIscrizioni(iscrizioni: Iscrizione[], teamsEsistenti: Team[]): Iscrizione[] {
  const nomi = new Set(teamsEsistenti.map((t) => t.nome.trim().toLowerCase()))
  return iscrizioni.filter((i) => !nomi.has(i.nomeSquadra.trim().toLowerCase()))
}
