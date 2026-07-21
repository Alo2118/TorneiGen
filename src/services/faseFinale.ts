import { db } from '../db/database'
import { getTournament, groupsOf, matchesOf } from '../db/repositories'
import { classificaGirone } from './standings'
import { qualifiedTeams } from '../engine/groups'
import { generateSingleElimination, resolveByes } from '../engine/bracket'
import { generateDoubleElimination } from '../engine/doubleElimination'
import { generateRoundRobin } from '../engine/roundRobin'
import { newId } from '../engine/id'
import { pubblicaSeAttivo } from './pubblicazione'
import type { Group, Match } from '../engine/types'

const isPotenzaDi2 = (n: number): boolean => n >= 2 && (n & (n - 1)) === 0

export async function generaFaseFinale(tournamentId: string): Promise<number> {
  const torneo = await getTournament(tournamentId)
  if (!torneo) throw new Error('Torneo non trovato')

  const groups = await groupsOf(tournamentId)
  const matches = await matchesOf(tournamentId)
  const gironiVeri = groups.filter((g) => g.tipo !== 'consolazione')
  const idsVeri = new Set(gironiVeri.map((g) => g.id))
  // La precondizione considera solo i gironi veri: la consolazione si gioca dopo.
  const gironi = matches.filter((m) => m.fase === 'girone' && m.groupId != null && idsVeri.has(m.groupId))
  if (gironi.length === 0) throw new Error('Nessun girone da cui generare la fase finale.')
  if (!gironi.every((m) => m.stato === 'conclusa')) {
    throw new Error('Concludi tutte le partite dei gironi prima di generare la fase finale.')
  }

  const classifiche = gironiVeri.map((g) => classificaGirone(g, matches, torneo.regolePunteggio))
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
      id: `${tournamentId}:${bm.id}`, tournamentId, fase: 'tabellone', tabelloneTipo: bm.tabelloneTipo,
      round: bm.round, posizioneTabellone: bm.index, teamAId: bm.teamAId, teamBId: bm.teamBId,
      set: [], stato: 'programmata',
      vincitoreVerso: bm.winnerFeeds ? { matchId: `${tournamentId}:${bm.winnerFeeds.matchId}`, slot: bm.winnerFeeds.slot } : null,
      perdenteVerso: bm.loserFeeds ? { matchId: `${tournamentId}:${bm.loserFeeds.matchId}`, slot: bm.loserFeeds.slot } : null,
    }))
  } else {
    const bracket = resolveByes(generateSingleElimination(ids))
    tabellone = bracket.map((bm) => ({
      id: `${tournamentId}:${bm.id}`, tournamentId, fase: 'tabellone', round: bm.round,
      posizioneTabellone: bm.index, teamAId: bm.teamAId, teamBId: bm.teamBId, set: [], stato: 'programmata',
    }))
    // Finalina 3°/4° posto: i perdenti delle due semifinali (round 1, ultimo round 2).
    if (torneo.finaleTerzoPosto) {
      const semifinali = tabellone
        .filter((m) => m.round === 1)
        .sort((a, b) => (a.posizioneTabellone ?? 0) - (b.posizioneTabellone ?? 0))
      const ultimoRound = Math.max(...tabellone.map((m) => m.round))
      if (semifinali.length === 2 && ultimoRound === 2) {
        const finalinaId = `${tournamentId}:terzo`
        semifinali[0].perdenteVerso = { matchId: finalinaId, slot: 'A' }
        semifinali[1].perdenteVerso = { matchId: finalinaId, slot: 'B' }
        tabellone.push({
          id: finalinaId, tournamentId, fase: 'tabellone', tabelloneTipo: 'terzo',
          round: 2, posizioneTabellone: 1, teamAId: null, teamBId: null, set: [], stato: 'programmata',
        })
      }
    }
  }

  // Girone di consolazione: le squadre non qualificate (oltre i primi perGirone
  // di ogni girone vero) in un unico round-robin di sola andata.
  let consGroup: Group | null = null
  let consMatches: Match[] = []
  if (torneo.gironeConsolazione) {
    const nonQualificati = classifiche.flatMap((c) => c.slice(perGirone).map((r) => r.teamId))
    if (nonQualificati.length >= 2) {
      consGroup = { id: newId(), tournamentId, nome: 'Consolazione', teamIds: nonQualificati, tipo: 'consolazione' }
      consMatches = generateRoundRobin(nonQualificati)
        .filter((p) => p.teamAId != null && p.teamBId != null)
        .map((p) => ({
          id: newId(), tournamentId, fase: 'girone', groupId: consGroup!.id, round: p.round,
          teamAId: p.teamAId, teamBId: p.teamBId, set: [], stato: 'programmata',
        }))
    }
  }

  // Sostituisce tabellone e consolazione preesistenti (rigenerazione); lascia i gironi veri.
  const esistentiTab = matches.filter((m) => m.fase === 'tabellone').map((m) => m.id)
  const consEsistenti = groups.filter((g) => g.tipo === 'consolazione')
  const consIdEsistenti = new Set(consEsistenti.map((g) => g.id))
  const consMatchEsistenti = matches.filter((m) => m.groupId != null && consIdEsistenti.has(m.groupId)).map((m) => m.id)
  await db.transaction('rw', db.matches, db.groups, async () => {
    if (esistentiTab.length) await db.matches.bulkDelete(esistentiTab)
    if (consMatchEsistenti.length) await db.matches.bulkDelete(consMatchEsistenti)
    if (consEsistenti.length) await db.groups.bulkDelete(consEsistenti.map((g) => g.id))
    await db.matches.bulkPut(tabellone)
    if (consGroup) {
      await db.groups.add(consGroup)
      await db.matches.bulkPut(consMatches)
    }
  })
  void pubblicaSeAttivo(tournamentId)
  return tabellone.length
}
