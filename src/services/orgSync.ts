import type { RegistrationsClient, TorneoCloud } from './registrations-api'
import type { OrgDoc } from '../types/org'
import { getClient, getSessione } from './config'
import { getTournament, matchesOf, saveTournament } from '../db/repositories'
import { buildOrgDoc, applyOrgDoc, scriviOrgLocale, strutturaDiverge } from './orgDoc'

/**
 * true se il locale ha esiti che il cloud deve ancora ricevere: risultati per
 * partite che il cloud non ha, OPPURE un risultato PIÙ RECENTE (per timestamp)
 * per una partita che il cloud ha già. In entrambi i casi va ri-propagato per
 * far convergere i due dispositivi.
 */
function haRisultatiExtra(docLocale: OrgDoc, docCloud: OrgDoc): boolean {
  const cloudById = new Map((docCloud.risultati ?? []).map((r) => [r.id, r]))
  return (docLocale.risultati ?? []).some((r) => {
    const c = cloudById.get(r.id)
    if (!c) return true
    return r.risultatoAggiornatoAl != null && (c.risultatoAggiornatoAl == null || r.risultatoAggiornatoAl > c.risultatoAggiornatoAl)
  })
}

export type StatoSync = 'sincronizzato' | 'aggiornato' | 'conflitto' | 'errore' | 'inpari'

export interface EsitoSync {
  stato: StatoSync
  versioneCloud?: number
  docCloud?: OrgDoc
}

/** La sync è attiva solo se online e con una sessione utente impostata (local-first). */
export function sincronizzabile(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  if (!getSessione()) return false
  return true
}

export type EsitoConfronto =
  | 'offline' // non sincronizzabile (offline o senza login)
  | 'inpari' // locale e cloud allineati
  | 'cloud_avanti' // il cloud ha una versione più recente: si può aggiornare
  | 'locale_pendente' // ci sono modifiche locali non ancora sul cloud
  | 'conflitto' // sia locale sia cloud sono cambiati
  | 'errore'

/**
 * Confronta lo stato locale col cloud SENZA applicare nulla (solo diagnosi),
 * per segnalare all'utente se ci sono aggiornamenti da tirare o modifiche da inviare.
 */
export async function confrontaCloud(
  tournamentId: string,
  client: RegistrationsClient = getClient(),
): Promise<{ stato: EsitoConfronto; versioneCloud?: number }> {
  if (!sincronizzabile()) return { stato: 'offline' }
  const t = await getTournament(tournamentId)
  if (!t) return { stato: 'errore' }
  let record
  try {
    record = await client.getOrg(t.codiceIscrizione)
  } catch {
    return { stato: 'errore' }
  }
  const locale = t.orgVersion ?? 0
  if (!record) return { stato: t.orgPending ? 'locale_pendente' : 'inpari' }
  if (record.version > locale) {
    // Con modifiche locali pendenti è conflitto SOLO se diverge la struttura;
    // se sono solo punteggi, l'Aggiorna li unisce → segnalo aggiornamenti dal cloud.
    if (t.orgPending) {
      let docCloud: OrgDoc
      let docLocale: OrgDoc
      try {
        docCloud = JSON.parse(record.doc) as OrgDoc
        docLocale = await buildOrgDoc(tournamentId)
      } catch {
        return { stato: 'errore' }
      }
      if (strutturaDiverge(docLocale, docCloud)) return { stato: 'conflitto', versioneCloud: record.version }
    }
    return { stato: 'cloud_avanti', versioneCloud: record.version }
  }
  if (record.version < locale || t.orgPending) return { stato: 'locale_pendente', versioneCloud: record.version }
  return { stato: 'inpari', versioneCloud: record.version }
}

// Helper privato: push del documento con una versione-base esplicita.
async function eseguiPush(
  tournamentId: string,
  base: number,
  client: RegistrationsClient,
): Promise<EsitoSync> {
  const t = await getTournament(tournamentId)
  if (!t) return { stato: 'errore' }
  try {
    const doc = await buildOrgDoc(tournamentId)
    const esito = await client.putOrg(t.codiceIscrizione, JSON.stringify(doc), base)
    if (esito.conflitto) return { stato: 'conflitto', versioneCloud: esito.version }
    await saveTournament({ ...t, orgVersion: esito.version, orgPending: false })
    return { stato: 'sincronizzato', versioneCloud: esito.version }
  } catch {
    return { stato: 'errore' }
  }
}

// Helper privato: applica un documento cloud al locale (merge punteggi) e fissa la versione.
export async function applicaEScrivi(tournamentId: string, doc: OrgDoc, versione: number): Promise<void> {
  const [t, locali] = await Promise.all([getTournament(tournamentId), matchesOf(tournamentId)])
  const stato = applyOrgDoc(doc, t, locali)
  await scriviOrgLocale({ ...stato, tournament: { ...stato.tournament, orgVersion: versione, orgPending: false } })
}

export async function spingiOrg(
  tournamentId: string,
  client: RegistrationsClient = getClient(),
): Promise<EsitoSync> {
  const t = await getTournament(tournamentId)
  if (!t) return { stato: 'errore' }
  return eseguiPush(tournamentId, t.orgVersion ?? 0, client)
}

export async function tiraOrg(
  tournamentId: string,
  client: RegistrationsClient = getClient(),
): Promise<EsitoSync> {
  const t = await getTournament(tournamentId)
  if (!t) return { stato: 'errore' }
  let record
  try {
    record = await client.getOrg(t.codiceIscrizione)
  } catch {
    return { stato: 'errore' }
  }
  if (!record) return spingiOrg(tournamentId, client)

  const versioneLocale = t.orgVersion ?? 0
  if (record.version === versioneLocale) {
    if (t.orgPending) return spingiOrg(tournamentId, client)
    return { stato: 'inpari', versioneCloud: record.version }
  }
  if (record.version < versioneLocale) return spingiOrg(tournamentId, client)

  let doc: OrgDoc
  try {
    doc = JSON.parse(record.doc) as OrgDoc
  } catch {
    return { stato: 'errore' }
  }
  // Conflitto vero solo se le modifiche locali pendenti toccano la STRUTTURA.
  // Se sono solo punteggi, si uniscono (i risultati del cloud vincono per-partita,
  // i miei risultati non ancora sul cloud vengono ri-propagati per convergere).
  let docLocale: OrgDoc
  try {
    docLocale = await buildOrgDoc(tournamentId)
  } catch {
    return { stato: 'errore' }
  }
  if (t.orgPending && strutturaDiverge(docLocale, doc)) {
    return { stato: 'conflitto', versioneCloud: record.version, docCloud: doc }
  }
  await applicaEScrivi(tournamentId, doc, record.version)
  if (haRisultatiExtra(docLocale, doc)) {
    const esitoPush = await spingiOrg(tournamentId, client)
    if (esitoPush.stato !== 'conflitto') return esitoPush
    // Un altro dispositivo ha scritto tra il nostro pull e il re-push (409). I
    // risultati extra sono già uniti in locale: NON vanno persi. Ripristino il
    // pending e propongo la risoluzione col documento cloud più recente, così il
    // conflitto è risolvibile dal banner invece di restare muto.
    await marcaPending(tournamentId)
    let recNuovo: Awaited<ReturnType<RegistrationsClient['getOrg']>> = null
    try {
      recNuovo = await client.getOrg(t.codiceIscrizione)
    } catch {
      recNuovo = null
    }
    if (recNuovo) {
      try {
        return { stato: 'conflitto', versioneCloud: recNuovo.version, docCloud: JSON.parse(recNuovo.doc) as OrgDoc }
      } catch {
        // doc cloud illeggibile: ricade sul conflitto senza docCloud
      }
    }
    return { stato: 'conflitto', versioneCloud: esitoPush.versioneCloud }
  }
  return { stato: 'aggiornato', versioneCloud: record.version }
}

export async function caricaDalCloud(
  codice: string,
  client: RegistrationsClient = getClient(),
): Promise<string | null> {
  const record = await client.getOrg(codice)
  if (!record) return null
  let doc: OrgDoc
  try {
    doc = JSON.parse(record.doc) as OrgDoc
  } catch {
    return null
  }
  await applicaEScrivi(doc.tournament.id, doc, record.version)
  return doc.tournament.id
}

/** Elenco dei tornei della propria società presenti nel cloud (per "I miei tornei dal cloud"). */
export async function elencoTorneiCloud(client: RegistrationsClient = getClient()): Promise<TorneoCloud[]> {
  return client.elencoOrg()
}

export async function risolviConflittoUsaCloud(
  tournamentId: string,
  docCloud: OrgDoc,
  versioneCloud: number,
  client: RegistrationsClient = getClient(),
): Promise<void> {
  const docLocale = await buildOrgDoc(tournamentId)
  await applicaEScrivi(tournamentId, docCloud, versioneCloud)
  // i miei risultati non presenti nel cloud non vanno persi: ri-propagali
  if (haRisultatiExtra(docLocale, docCloud)) await spingiOrg(tournamentId, client)
}

export async function risolviConflittoSovrascrivi(
  tournamentId: string,
  versioneCloud: number,
  client: RegistrationsClient = getClient(),
): Promise<EsitoSync> {
  return eseguiPush(tournamentId, versioneCloud, client)
}

const DEBOUNCE_MS = 1500
const timer = new Map<string, ReturnType<typeof setTimeout>>()

// Notifica leggera per far reagire la UI (es. la pillola SyncStato) quando lo
// stato di sync cambia: modifica locale marcata pending, o esito del push
// automatico (compreso un eventuale conflitto/errore). Senza questo, la pillola
// resterebbe stantìa e un push fallito passerebbe del tutto inosservato.
type ListenerSync = (tournamentId: string) => void
const listenerSync = new Set<ListenerSync>()
export function onSyncCambiato(l: ListenerSync): () => void {
  listenerSync.add(l)
  return () => listenerSync.delete(l)
}
function emitSync(tournamentId: string): void {
  for (const l of listenerSync) l(tournamentId)
}

async function marcaPending(tournamentId: string): Promise<void> {
  const t = await getTournament(tournamentId)
  if (t && !t.orgPending) {
    await saveTournament({ ...t, orgPending: true })
    emitSync(tournamentId)
  }
}

/**
 * Da chiamare dopo ogni modifica locale (organizzazione o punteggi): marca il
 * pending e programma l'invio automatico al cloud (debounced). L'esito del push
 * viene notificato via onSyncCambiato così la UI non resta convinta a torto che
 * i dati siano già sincronizzati.
 */
export function notificaModificaOrg(tournamentId: string, client: RegistrationsClient = getClient()): void {
  void marcaPending(tournamentId)
  if (!sincronizzabile()) return
  const esistente = timer.get(tournamentId)
  if (esistente) clearTimeout(esistente)
  timer.set(
    tournamentId,
    setTimeout(() => {
      timer.delete(tournamentId)
      void spingiOrg(tournamentId, client).finally(() => emitSync(tournamentId))
    }, DEBOUNCE_MS),
  )
}
