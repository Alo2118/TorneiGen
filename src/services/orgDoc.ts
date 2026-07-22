import type { Tournament, Team, Group, Match } from '../engine/types'
import type { OrgDoc, MatchStruct, RisultatoStruct } from '../types/org'
import { db } from '../db/database'
import { getTournament, teamsOf, groupsOf, matchesOf } from '../db/repositories'
import { propagaTabellone, propagaDoppia } from './results'

function strutturaDaMatch(m: Match): MatchStruct {
  const copia: Partial<Match> = { ...m }
  delete copia.set
  delete copia.vincitoreId
  delete copia.stato
  return copia as MatchStruct
}

// Una partita ha un esito da sincronizzare se ha almeno un set, non è più
// programmata, oppure è stata toccata (ha un timestamp): quest'ultimo caso è il
// "tombstone" di un annullamento, che deve convergere sull'altro dispositivo.
function haRisultato(m: { set: Match['set']; stato: Match['stato']; risultatoAggiornatoAl?: string }): boolean {
  return m.set.length > 0 || m.stato !== 'programmata' || m.risultatoAggiornatoAl != null
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
  // Nel tabellone gli occupanti (teamAId/teamBId) NON sono struttura ma stato
  // derivato dai risultati: round 1 dal ranking dei gironi, round successivi
  // dall'avanzamento dei vincitori. Confrontarli genererebbe falsi conflitti tra
  // dispositivi che hanno inserito risultati diversi. La FORMA del tabellone
  // (numero di slot, round, posizione, tipo) resta invece strutturale.
  const normStruct = (s: MatchStruct): MatchStruct => {
    if (s.fase !== 'tabellone') return s
    const copia: Partial<MatchStruct> = { ...s }
    delete copia.teamAId
    delete copia.teamBId
    return copia as MatchStruct
  }
  const norm = (d: OrgDoc): string =>
    JSON.stringify({
      tournament: d.tournament ?? null,
      teams: perId(d.teams),
      groups: perId(d.groups),
      struttura: perId(d.struttura).map(normStruct),
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
    .map((m) => ({ id: m.id, set: m.set, vincitoreId: m.vincitoreId ?? null, stato: m.stato, risultatoAggiornatoAl: m.risultatoAggiornatoAl }))
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
    // Merge per-partita convergente: quando entrambi i dispositivi hanno un
    // esito per la stessa partita vince il PIÙ RECENTE (per timestamp); se solo
    // uno dei due ce l'ha, si tiene quello (unione senza perdite). A parità o in
    // assenza di timestamp (dati pre-timestamp) prevale il cloud, per determinismo.
    const cloud = risultatiCloud.get(s.id)
    const locale = perId.get(s.id)
    const vinceLocale =
      locale != null &&
      (cloud == null ||
        (locale.risultatoAggiornatoAl != null &&
          (cloud.risultatoAggiornatoAl == null || locale.risultatoAggiornatoAl > cloud.risultatoAggiornatoAl)))
    if (vinceLocale) {
      return {
        ...s,
        set: locale.set,
        vincitoreId: locale.vincitoreId ?? null,
        stato: locale.stato,
        risultatoAggiornatoAl: locale.risultatoAggiornatoAl,
      }
    }
    if (cloud) {
      return { ...s, set: cloud.set, vincitoreId: cloud.vincitoreId ?? null, stato: cloud.stato, risultatoAggiornatoAl: cloud.risultatoAggiornatoAl }
    }
    return { ...s, set: [], vincitoreId: null, stato: 'programmata' }
  })
  const tournament: Tournament = {
    ...doc.tournament,
    pubblicato: localTournament?.pubblicato,
    orgVersion: localTournament?.orgVersion,
    orgPending: localTournament?.orgPending,
  }
  // Nel tabellone il vincitore avanza (teamAId/teamBId dei turni successivi sono
  // stato DERIVATO dai risultati). Dopo il merge ricalcolo l'avanzamento, così la
  // struttura resta coerente coi risultati qualunque sia la loro provenienza.
  const haTabellone = matches.some((m) => m.fase === 'tabellone')
  const haDoppia = matches.some((m) => m.tabelloneTipo !== undefined && m.tabelloneTipo !== 'terzo')
  const finali = !haTabellone
    ? matches
    : haDoppia
      ? propagaDoppia(matches, tournament.regolePunteggio)
      : propagaTabellone(matches, tournament.regolePunteggio)
  return { tournament, teams: doc.teams, groups: doc.groups, matches: finali }
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
