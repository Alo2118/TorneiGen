import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../db/database'
import { saveTournament, getTournament, matchesOf } from '../db/repositories'
import { spingiOrg, tiraOrg, risolviConflittoUsaCloud, risolviConflittoSovrascrivi } from './orgSync'
import { buildOrgDoc } from './orgDoc'
import type { RegistrationsClient } from './registrations-api'
import type { OrgRecord } from '../types/org'
import type { Tournament, Match } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123', qualificatiPerGirone: 'tutti',
}
const match = (id: string, over: Partial<Match> = {}): Match => ({
  id, tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'a', teamBId: 'b',
  set: [], stato: 'programmata', ...over,
})

// Client fake: implementa solo i metodi org usati; gli altri lanciano.
function fakeClient(over: Partial<RegistrationsClient>): RegistrationsClient {
  const base = {
    getOrg: async () => null,
    putOrg: async () => ({ conflitto: false, version: 1 }),
    deleteOrg: async () => {},
  } as unknown as RegistrationsClient
  return { ...base, ...over }
}

beforeEach(async () => {
  await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  await saveTournament(torneo)
  await db.matches.put(match('m1'))
})

describe('spingiOrg', () => {
  it('su 200 aggiorna orgVersion e azzera orgPending', async () => {
    await saveTournament({ ...torneo, orgPending: true, orgVersion: 0 })
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 1 }))
    const esito = await spingiOrg('t1', fakeClient({ putOrg }))
    expect(esito.stato).toBe('sincronizzato')
    expect(putOrg).toHaveBeenCalledWith('ABC123', expect.any(String), 0)
    const t = await getTournament('t1')
    expect(t?.orgVersion).toBe(1)
    expect(t?.orgPending).toBe(false)
  })

  it('su 409 restituisce conflitto senza toccare orgPending', async () => {
    await saveTournament({ ...torneo, orgPending: true, orgVersion: 2 })
    const esito = await spingiOrg('t1', fakeClient({ putOrg: async () => ({ conflitto: true, version: 5 }) }))
    expect(esito.stato).toBe('conflitto')
    expect(esito.versioneCloud).toBe(5)
    const t = await getTournament('t1')
    expect(t?.orgPending).toBe(true)
  })

  it('su errore di rete restituisce errore e lascia orgPending', async () => {
    await saveTournament({ ...torneo, orgPending: true })
    const esito = await spingiOrg('t1', fakeClient({ putOrg: async () => { throw new Error('offline') } }))
    expect(esito.stato).toBe('errore')
    const t = await getTournament('t1')
    expect(t?.orgPending).toBe(true)
  })
})

describe('tiraOrg', () => {
  it('se il cloud è assente fa il primo upload (push)', async () => {
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 1 }))
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => null, putOrg }))
    expect(putOrg).toHaveBeenCalled()
    expect(esito.stato).toBe('sincronizzato')
  })

  it('se cloud è avanti e non ci sono modifiche pendenti, applica il documento', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: false })
    const doc = await buildOrgDoc('t1')
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify({ ...doc, teams: [], groups: [], struttura: [] }), version: 4, updatedAt: 'x' }
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record }))
    expect(esito.stato).toBe('aggiornato')
    const t = await getTournament('t1')
    expect(t?.orgVersion).toBe(4)
    const matches = await matchesOf('t1')
    expect(matches).toHaveLength(0) // struttura cloud vuota → match locali rimossi
  })

  it('se cloud è avanti CON modifiche pendenti, segnala conflitto', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    const doc = await buildOrgDoc('t1')
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(doc), version: 4, updatedAt: 'x' }
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record }))
    expect(esito.stato).toBe('conflitto')
    expect(esito.versioneCloud).toBe(4)
    expect(esito.docCloud).toBeTruthy()
  })

  it('se le versioni combaciano e non c\'è pending, è in pari', async () => {
    await saveTournament({ ...torneo, orgVersion: 4, orgPending: false })
    const doc = await buildOrgDoc('t1')
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(doc), version: 4, updatedAt: 'x' }
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record }))
    expect(esito.stato).toBe('inpari')
  })
})

describe('risoluzione conflitti', () => {
  it('usa cloud: applica il doc e azzera pending', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    const doc = await buildOrgDoc('t1')
    await risolviConflittoUsaCloud('t1', { ...doc, struttura: [] }, 4)
    const t = await getTournament('t1')
    expect(t?.orgVersion).toBe(4)
    expect(t?.orgPending).toBe(false)
    expect(await matchesOf('t1')).toHaveLength(0)
  })

  it('sovrascrivi: ri-pusha con la versione cloud come base', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 5 }))
    const esito = await risolviConflittoSovrascrivi('t1', 4, fakeClient({ putOrg }))
    expect(putOrg).toHaveBeenCalledWith('ABC123', expect.any(String), 4)
    expect(esito.stato).toBe('sincronizzato')
    const t = await getTournament('t1')
    expect(t?.orgVersion).toBe(5)
    expect(t?.orgPending).toBe(false)
  })
})
