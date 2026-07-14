import { db } from '../db/database'
import { getTournament, matchesOf } from '../db/repositories'
import { pianifica } from '../engine/scheduler'

export async function programmaCalendario(tournamentId: string): Promise<number> {
  const torneo = await getTournament(tournamentId)
  if (!torneo) throw new Error('Torneo non trovato')
  if (!torneo.giornate || torneo.giornate.length === 0) {
    throw new Error('Configura almeno una giornata nel calendario (Impostazioni del torneo).')
  }
  const partite = await matchesOf(tournamentId)
  const pianificate = pianifica(partite, {
    giornate: torneo.giornate,
    numeroCampi: torneo.numeroCampi ?? 1,
    durataMin: torneo.durataPartitaMin ?? 30,
  })
  await db.matches.bulkPut(pianificate)
  return pianificate.filter((p) => p.orario).length
}
