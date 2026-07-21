import type { Tournament, Group, Match } from '../engine/types'
import { partiteGirone } from './generation'
import { newId } from '../engine/id'

// Rigenera il round-robin dei soli gironi indicati, lasciando invariate le
// partite degli altri gironi e del tabellone (fase finale).
function rigenera(torneo: Tournament, groups: Group[], matches: Match[], daRigenerare: Set<string>): Match[] {
  const invariati = matches.filter((m) => !(m.fase === 'girone' && m.groupId != null && daRigenerare.has(m.groupId)))
  const nuove = groups.filter((g) => daRigenerare.has(g.id)).flatMap((g) => partiteGirone(torneo, g))
  return [...invariati, ...nuove]
}

/**
 * Sposta una squadra nel girone `toGroupId`. Rigenera le partite dei due gironi
 * coinvolti (i loro punteggi si azzerano); gli altri gironi e il tabellone restano.
 * No-op se la squadra è già in quel girone o i riferimenti non esistono.
 */
export function spostaSquadra(
  torneo: Tournament,
  groups: Group[],
  matches: Match[],
  teamId: string,
  toGroupId: string,
): { groups: Group[]; matches: Match[] } {
  const from = groups.find((g) => g.teamIds.includes(teamId))
  const to = groups.find((g) => g.id === toGroupId)
  if (!from || !to || from.id === to.id) return { groups, matches }
  const nuoviGruppi = groups.map((g) => {
    if (g.id === from.id) return { ...g, teamIds: g.teamIds.filter((x) => x !== teamId) }
    if (g.id === to.id) return { ...g, teamIds: [...g.teamIds, teamId] }
    return g
  })
  return { groups: nuoviGruppi, matches: rigenera(torneo, nuoviGruppi, matches, new Set([from.id, to.id])) }
}

/** Aggiunge un girone vuoto (nome con la prossima lettera libera). */
export function aggiungiGirone(torneo: Tournament, groups: Group[]): Group[] {
  const nome = `Girone ${String.fromCharCode(65 + groups.length)}`
  return [...groups, { id: newId(), tournamentId: torneo.id, nome, teamIds: [] }]
}

/** Rimuove un girone solo se è vuoto (nessuna squadra). No-op altrimenti. */
export function rimuoviGirone(
  groups: Group[],
  matches: Match[],
  groupId: string,
): { groups: Group[]; matches: Match[] } {
  const g = groups.find((x) => x.id === groupId)
  if (!g || g.teamIds.length > 0) return { groups, matches }
  return {
    groups: groups.filter((x) => x.id !== groupId),
    matches: matches.filter((m) => m.groupId !== groupId),
  }
}
