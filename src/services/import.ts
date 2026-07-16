import type { Iscrizione } from '../types/registrations'
import type { Team, Tipologia } from '../engine/types'
import { newId } from '../engine/id'
import { etichettaSquadra, etichettaIscrizione } from './teams'

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

export function nuoveIscrizioni(
  iscrizioni: Iscrizione[],
  teamsEsistenti: Team[],
  tipologia: Tipologia,
): Iscrizione[] {
  const chiavi = new Set(teamsEsistenti.map((t) => etichettaSquadra(t, tipologia).trim().toLowerCase()))
  return iscrizioni.filter((i) => !chiavi.has(etichettaIscrizione(i, tipologia).trim().toLowerCase()))
}
