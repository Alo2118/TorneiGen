import type { Tournament, Team, Group, Match } from '../engine/types'
import type { OrgDoc, MatchStruct, RisultatoStruct } from '../types/org'
import { db } from '../db/database'
import { getTournament, teamsOf, groupsOf, matchesOf } from '../db/repositories'

function strutturaDaMatch(m: Match): MatchStruct {
  const copia: Partial<Match> = { ...m }
  delete copia.set
  delete copia.vincitoreId
  delete copia.stato
  return copia as MatchStruct
}

// Una partita ha un esito da sincronizzare se ha almeno un set o non è più programmata.
function haRisultato(m: { set: Match['set']; stato: Match['stato'] }): boolean {
  return m.set.length > 0 || m.stato !== 'programmata'
}

/**
 * true se due documenti divergono nella STRUTTURA (torneo, squadre, gironi,
 * tabellone), ignorando i risultati. Serve a distinguere un vero conflitto
 * strutturale da una semplice divergenza di punteggi (che si unisce senza
 * conflitto). Robusto verso documenti incompleti (campi mancanti).
 */
export function strutturaDiverge(a: OrgDoc, b: OrgDoc): boolean {
  const perId = <T extends { id: string }>(xs: T[] | undefined): T[] =>
    [...(xs ?? [])].sort((x, y) => x.id.localeCompare(y.id))
  const norm = (d: OrgDoc): string =>
    JSON.stringify({
      tournament: d.tournament ?? null,
      teams: perId(d.teams),
      groups: perId(d.groups),
      struttura: perId(d.struttura),
    })
  return norm(a) !== norm(b)
}

export async function buildOrgDoc(tournamentId: string): Promise<OrgDoc> {
  const [t, teams, groups, matches] = await Promise.all([
    getTournament(tournamentId),
    teamsOf(tournamentId),
    groupsOf(tournamentId),
    matchesOf(tournamentId),
  ])
  if (!t) throw new Error('Torneo non trovato')
  const tournament: Tournament = { ...t, pubblicato: undefined, orgVersion: undefined, orgPending: undefined }
  const risultati: RisultatoStruct[] = matches
    .filter(haRisultato)
    .map((m) => ({ id: m.id, set: m.set, vincitoreId: m.vincitoreId ?? null, stato: m.stato }))
  return { tournament, teams, groups, struttura: matches.map(strutturaDaMatch), risultati }
}

export interface StatoLocaleOrg {
  tournament: Tournament
  teams: Team[]
  groups: Group[]
  matches: Match[]
}

export function applyOrgDoc(
  doc: OrgDoc,
  localTournament: Tournament | undefined,
  localMatches: Match[],
): StatoLocaleOrg {
  const perId = new Map(localMatches.map((m) => [m.id, m]))
  const risultatiCloud = new Map((doc.risultati ?? []).map((x) => [x.id, x]))
  const matches: Match[] = doc.struttura.map((s) => {
    // Merge per-partita: il risultato dal cloud vince se presente, altrimenti
    // si tiene quello locale (unione senza perdite tra i due dispositivi).
    const cloud = risultatiCloud.get(s.id)
    if (cloud) {
      return { ...s, set: cloud.set, vincitoreId: cloud.vincitoreId ?? null, stato: cloud.stato }
    }
    const locale = perId.get(s.id)
    return {
      ...s,
      set: locale?.set ?? [],
      vincitoreId: locale?.vincitoreId ?? null,
      stato: locale?.stato ?? 'programmata',
    }
  })
  const tournament: Tournament = {
    ...doc.tournament,
    pubblicato: localTournament?.pubblicato,
    orgVersion: localTournament?.orgVersion,
    orgPending: localTournament?.orgPending,
  }
  return { tournament, teams: doc.teams, groups: doc.groups, matches }
}

export async function scriviOrgLocale(s: StatoLocaleOrg): Promise<void> {
  await db.transaction('rw', db.tournaments, db.teams, db.groups, db.matches, async () => {
    await db.tournaments.put(s.tournament)
    await db.teams.where('tournamentId').equals(s.tournament.id).delete()
    await db.groups.where('tournamentId').equals(s.tournament.id).delete()
    await db.matches.where('tournamentId').equals(s.tournament.id).delete()
    if (s.teams.length) await db.teams.bulkPut(s.teams)
    if (s.groups.length) await db.groups.bulkPut(s.groups)
    if (s.matches.length) await db.matches.bulkPut(s.matches)
  })
}
