import type { RegistrationsClient } from './registrations-api'
import type { OrgDoc } from '../types/org'
import { getClient, getWriteToken } from './config'
import { getTournament, matchesOf, saveTournament } from '../db/repositories'
import { buildOrgDoc, applyOrgDoc, scriviOrgLocale } from './orgDoc'

export type StatoSync = 'sincronizzato' | 'aggiornato' | 'conflitto' | 'errore' | 'inpari'

export interface EsitoSync {
  stato: StatoSync
  versioneCloud?: number
  docCloud?: OrgDoc
}

/** La sync è attiva solo se online e con token di scrittura impostato (local-first). */
export function sincronizzabile(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  if (!getWriteToken()) return false
  return true
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
  if (t.orgPending) return { stato: 'conflitto', versioneCloud: record.version, docCloud: doc }

  await applicaEScrivi(tournamentId, doc, record.version)
  return { stato: 'aggiornato', versioneCloud: record.version }
}

export async function risolviConflittoUsaCloud(
  tournamentId: string,
  docCloud: OrgDoc,
  versioneCloud: number,
): Promise<void> {
  await applicaEScrivi(tournamentId, docCloud, versioneCloud)
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

async function marcaPending(tournamentId: string): Promise<void> {
  const t = await getTournament(tournamentId)
  if (t && !t.orgPending) await saveTournament({ ...t, orgPending: true })
}

/** Da chiamare dopo ogni modifica dell'ORGANIZZAZIONE (non dei punteggi). */
export function notificaModificaOrg(tournamentId: string, client: RegistrationsClient = getClient()): void {
  void marcaPending(tournamentId)
  if (!sincronizzabile()) return
  const esistente = timer.get(tournamentId)
  if (esistente) clearTimeout(esistente)
  timer.set(
    tournamentId,
    setTimeout(() => {
      timer.delete(tournamentId)
      void spingiOrg(tournamentId, client)
    }, DEBOUNCE_MS),
  )
}
