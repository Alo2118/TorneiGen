import type { SetScore, RegolePunteggio } from '../engine/types'
import { db } from '../db/database'
import { applicaRisultato, propagaTabellone, propagaDoppia } from './results'
import { pubblicaSeAttivo } from './pubblicazione'

export async function salvaEProppaga(
  tournamentId: string,
  matchId: string,
  set: SetScore[],
  regole: RegolePunteggio,
): Promise<void> {
  const matches = await db.matches.where('tournamentId').equals(tournamentId).toArray()
  const target = matches.find((m) => m.id === matchId)
  if (!target) throw new Error(`Partita ${matchId} non trovata`)
  const regoleMatch = target.tabelloneTipo === 'golden' ? { ...regole, setAlMeglioDi: 1 as const } : regole
  const aggiornato = applicaRisultato(target, set, regoleMatch)
  const conRisultato = matches.map((m) => (m.id === matchId ? aggiornato : m))
  const doppia = matches.some((m) => m.tabelloneTipo !== undefined)
  const finali = doppia ? propagaDoppia(conRisultato, regole) : propagaTabellone(conRisultato, regole)
  await db.matches.bulkPut(finali)
  void pubblicaSeAttivo(tournamentId)
}
