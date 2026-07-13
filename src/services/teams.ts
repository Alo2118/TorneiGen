import type { Team, Tipologia } from '../engine/types'

export function numeroGiocatori(tipologia: Tipologia): { min: number; max: number } {
  return tipologia === '2x2' ? { min: 2, max: 2 } : { min: 4, max: 8 }
}

export function validaSquadra(team: Team, tipologia: Tipologia): string | null {
  const { min, max } = numeroGiocatori(tipologia)
  if (team.players.length < min) return `Servono almeno ${min} giocatori`
  if (team.players.length > max) return `Massimo ${max} giocatori`
  if (!team.nome.trim()) return 'Il nome squadra è obbligatorio'
  for (const p of team.players) {
    if (!p.nome.trim() || !p.cognome.trim() || !p.email.trim() || !p.telefono.trim()) {
      return 'Ogni giocatore richiede nome, cognome, email e telefono'
    }
  }
  return null
}
