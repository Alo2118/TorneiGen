import { db } from '../db/database'
import { getTournament, groupsOf, matchesOf } from '../db/repositories'
import { classificaGirone } from './standings'
import { qualifiedTeams } from '../engine/groups'
import { generateSingleElimination, resolveByes } from '../engine/bracket'
import { generateDoubleElimination } from '../engine/doubleElimination'
import type { Match } from '../engine/types'

const isPotenzaDi2 = (n: number): boolean => n >= 2 && (n & (n - 1)) === 0

export async function generaFaseFinale(tournamentId: string): Promise<number> {
  const torneo = await getTournament(tournamentId)
  if (!torneo) throw new Error('Torneo non trovato')

  const groups = await groupsOf(tournamentId)
  const matches = await matchesOf(tournamentId)
  const gironi = matches.filter((m) => m.fase === 'girone')
  if (gironi.length === 0) throw new Error('Nessun girone da cui generare la fase finale.')
  if (!gironi.every((m) => m.stato === 'conclusa')) {
    throw new Error('Concludi tutte le partite dei gironi prima di generare la fase finale.')
  }

  const classifiche = groups.map((g) => classificaGirone(g, matches, torneo.regolePunteggio))
  const perGirone =
    torneo.qualificatiPerGirone === 'tutti' || torneo.qualificatiPerGirone == null
      ? Math.max(...classifiche.map((c) => c.length))
      : torneo.qualificatiPerGirone
  const ids = qualifiedTeams(classifiche, perGirone)

  let tabellone: Match[]
  if (torneo.faseFinale === 'doppia') {
    if (!isPotenzaDi2(ids.length)) {
      throw new Error(
        `La fase finale doppia richiede un numero di qualificati potenza di 2 (attuali: ${ids.length}). Riduci i qualificati per girone o usa la diretta.`,
      )
    }
    const bracket = generateDoubleElimination(ids)
    tabellone = bracket.map((bm) => ({
      id: bm.id, tournamentId, fase: 'tabellone', tabelloneTipo: bm.tabelloneTipo,
      round: bm.round, posizioneTabellone: bm.index, teamAId: bm.teamAId, teamBId: bm.teamBId,
      set: [], stato: 'programmata', vincitoreVerso: bm.winnerFeeds, perdenteVerso: bm.loserFeeds,
    }))
  } else {
    const bracket = resolveByes(generateSingleElimination(ids))
    tabellone = bracket.map((bm) => ({
      id: bm.id, tournamentId, fase: 'tabellone', round: bm.round,
      posizioneTabellone: bm.index, teamAId: bm.teamAId, teamBId: bm.teamBId, set: [], stato: 'programmata',
    }))
  }

  // sostituisce eventuali match tabellone esistenti (rigenerazione), lascia i gironi
  const esistentiTab = matches.filter((m) => m.fase === 'tabellone').map((m) => m.id)
  await db.transaction('rw', db.matches, async () => {
    if (esistentiTab.length) await db.matches.bulkDelete(esistentiTab)
    await db.matches.bulkPut(tabellone)
  })
  return tabellone.length
}
