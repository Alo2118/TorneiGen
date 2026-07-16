import { getTournament, teamsOf, groupsOf, matchesOf, saveTournament } from '../db/repositories'
import { getClient, getReadToken } from './config'
import type { PublicSnapshot } from '../types/public'

export async function buildSnapshot(tournamentId: string): Promise<PublicSnapshot> {
  const [t, teams, groups, matches] = await Promise.all([
    getTournament(tournamentId),
    teamsOf(tournamentId),
    groupsOf(tournamentId),
    matchesOf(tournamentId),
  ])
  if (!t) throw new Error('Torneo non trovato')
  return {
    codice: t.codiceIscrizione,
    nome: t.nome,
    tipologia: t.tipologia,
    formato: t.formato,
    faseFinale: t.faseFinale,
    qualificatiPerGirone: t.qualificatiPerGirone,
    regolePunteggio: t.regolePunteggio,
    updatedAt: new Date().toISOString(),
    teams: teams.map((x) => ({ id: x.id, nome: x.nome })),
    groups: groups.map((g) => ({ id: g.id, nome: g.nome, teamIds: g.teamIds })),
    matches,
    giornate: t.giornate,
    numeroCampi: t.numeroCampi,
    durataPartitaMin: t.durataPartitaMin,
  }
}

export async function pubblica(tournamentId: string): Promise<void> {
  const snap = await buildSnapshot(tournamentId)
  await getClient().pubblicaSnapshot(snap)
  const t = await getTournament(tournamentId)
  if (t) await saveTournament({ ...t, pubblicato: true })
}

export async function interrompiPubblicazione(tournamentId: string): Promise<void> {
  const t = await getTournament(tournamentId)
  if (!t) return
  // se la rimozione remota fallisce l'errore si propaga: NON azzeriamo il flag,
  // così non riportiamo "interrotta" lasciando uno snapshot pubblico orfano.
  await getClient().rimuoviSnapshot(t.codiceIscrizione)
  await saveTournament({ ...t, pubblicato: false })
}

export async function pubblicaSeAttivo(tournamentId: string): Promise<void> {
  // interamente best-effort: nessun errore (nemmeno una lettura Dexie) deve propagarsi
  try {
    const t = await getTournament(tournamentId)
    if (!t?.pubblicato) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (!getReadToken()) return
    const snap = await buildSnapshot(tournamentId)
    await getClient().pubblicaSnapshot(snap)
  } catch {
    // best-effort: si aggiorna al prossimo salvataggio riuscito
  }
}
