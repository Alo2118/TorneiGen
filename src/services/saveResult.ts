import type { SetScore, RegolePunteggio } from '../engine/types'
import { db } from '../db/database'
import { applicaRisultato, propagaTabellone } from './results'

export async function salvaEProppaga(
  tournamentId: string,
  matchId: string,
  set: SetScore[],
  regole: RegolePunteggio,
): Promise<void> {
  const matches = await db.matches.where('tournamentId').equals(tournamentId).toArray()
  const target = matches.find((m) => m.id === matchId)
  if (!target) throw new Error(`Partita ${matchId} non trovata`)
  const aggiornato = applicaRisultato(target, set, regole)
  const conRisultato = matches.map((m) => (m.id === matchId ? aggiornato : m))
  const finali = propagaTabellone(conRisultato, regole)
  await db.matches.bulkPut(finali)
}
