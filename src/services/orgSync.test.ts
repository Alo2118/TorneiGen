import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db/database'
import { saveTournament, getTournament, matchesOf } from '../db/repositories'
import { spingiOrg, tiraOrg, risolviConflittoUsaCloud, risolviConflittoSovrascrivi, sincronizzabile, confrontaCloud } from './orgSync'
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

  it('se cloud è avanti con pending e la STRUTTURA diverge, segnala conflitto', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    const doc = await buildOrgDoc('t1')
    const docDiverso = { ...doc, tournament: { ...doc.tournament, nome: 'Struttura diversa' } }
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(docDiverso), version: 4, updatedAt: 'x' }
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record }))
    expect(esito.stato).toBe('conflitto')
    expect(esito.versioneCloud).toBe(4)
    expect(esito.docCloud).toBeTruthy()
  })

  it('se cloud è avanti con pending ma solo di PUNTEGGI (stessa struttura), unisce senza conflitto', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    const doc = await buildOrgDoc('t1') // stessa struttura, m1 senza risultato locale
    const docCloud = { ...doc, risultati: [{ id: 'm1', set: [{ puntiA: 21, puntiB: 9 }], vincitoreId: 'a', stato: 'conclusa' as const }] }
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(docCloud), version: 4, updatedAt: 'x' }
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record }))
    expect(esito.stato).toBe('aggiornato')
    const m = await matchesOf('t1')
    expect(m[0].set).toEqual([{ puntiA: 21, puntiB: 9 }]) // risultato preso dal cloud
  })

  it('con pending di punteggi non ancora sul cloud, unisce e RI-PROPAGA (push) per convergere', async () => {
    // il locale ha un risultato che il cloud non ha: dopo l'unione va ripushato
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    await db.matches.put(match('m1', { set: [{ puntiA: 21, puntiB: 5 }], stato: 'conclusa', vincitoreId: 'a' }))
    const doc = await buildOrgDoc('t1')
    const docCloud = { ...doc, risultati: [] } // il cloud non ha il risultato di m1
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(docCloud), version: 4, updatedAt: 'x' }
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 5 }))
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record, putOrg }))
    expect(putOrg).toHaveBeenCalled() // ri-propaga l'unione
    expect(esito.stato).toBe('sincronizzato')
  })

  it('se le versioni combaciano e non c\'è pending, è in pari', async () => {
    await saveTournament({ ...torneo, orgVersion: 4, orgPending: false })
    const doc = await buildOrgDoc('t1')
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(doc), version: 4, updatedAt: 'x' }
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record }))
    expect(esito.stato).toBe('inpari')
  })

  it('se le versioni combaciano MA c\'è pending, ripusha', async () => {
    await saveTournament({ ...torneo, orgVersion: 4, orgPending: true })
    const doc = await buildOrgDoc('t1')
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(doc), version: 4, updatedAt: 'x' }
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 5 }))
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record, putOrg }))
    expect(putOrg).toHaveBeenCalled()
    expect(esito.stato).toBe('sincronizzato')
  })

  it('se il locale è avanti rispetto al cloud, ripusha', async () => {
    await saveTournament({ ...torneo, orgVersion: 5, orgPending: false })
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify({}), version: 2, updatedAt: 'x' }
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 6 }))
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record, putOrg }))
    expect(putOrg).toHaveBeenCalled()
    expect(esito.stato).toBe('sincronizzato')
  })

  it('se il RE-PUSH dopo il merge va in conflitto, espone docCloud e mantiene il pending (A3: niente conflitto muto)', async () => {
    // Locale con un risultato non ancora sul cloud (pending, non strutturale).
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    await db.matches.put(match('m1', { set: [{ puntiA: 21, puntiB: 5 }], stato: 'conclusa', vincitoreId: 'a' }))
    const doc = await buildOrgDoc('t1')
    const docCloud = { ...doc, risultati: [] } // il cloud non ha il risultato di m1
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(docCloud), version: 4, updatedAt: 'x' }
    // Un altro dispositivo scrive tra il nostro pull e il nostro re-push → 409.
    const putOrg = vi.fn(async () => ({ conflitto: true, version: 7 }))
    const getOrg = vi.fn(async () => record)
    const esito = await tiraOrg('t1', fakeClient({ getOrg, putOrg }))
    expect(esito.stato).toBe('conflitto')
    expect(esito.docCloud).toBeTruthy() // risolvibile dal banner, non muto
    const t = await getTournament('t1')
    expect(t?.orgPending).toBe(true) // i risultati extra non vanno persi
  })

  it('ri-propaga (push) se il locale ha un risultato PIÙ RECENTE del cloud per la stessa partita (merge by-time)', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: true })
    await db.matches.put(match('m1', { set: [{ puntiA: 15, puntiB: 21 }], stato: 'conclusa', vincitoreId: 'b', risultatoAggiornatoAl: '2026-07-20T12:00:00Z' }))
    const doc = await buildOrgDoc('t1')
    // il cloud ha un risultato PIÙ VECCHIO per m1
    const docCloud = { ...doc, risultati: [{ id: 'm1', set: [{ puntiA: 21, puntiB: 5 }], vincitoreId: 'a', stato: 'conclusa' as const, risultatoAggiornatoAl: '2026-07-20T09:00:00Z' }] }
    const record: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(docCloud), version: 4, updatedAt: 'x' }
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 5 }))
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record, putOrg }))
    expect(putOrg).toHaveBeenCalled() // il locale più recente viene ri-propagato
    expect(esito.stato).toBe('sincronizzato')
  })

  it('se il doc cloud non è JSON valido, restituisce errore senza lanciare', async () => {
    await saveTournament({ ...torneo, orgVersion: 1, orgPending: false })
    const record: OrgRecord = { codice: 'ABC123', doc: 'non-json{', version: 4, updatedAt: 'x' }
    const esito = await tiraOrg('t1', fakeClient({ getOrg: async () => record }))
    expect(esito.stato).toBe('errore')
  })
})

describe('sincronizzabile', () => {
  afterEach(() => {
    localStorage.removeItem('sessione')
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('è true con sessione impostata e online', () => {
    localStorage.setItem('sessione', 'wt')
    expect(sincronizzabile()).toBe(true)
  })

  it('è false senza sessione', () => {
    localStorage.removeItem('sessione')
    expect(sincronizzabile()).toBe(false)
  })

  it('è false se offline', () => {
    localStorage.setItem('sessione', 'wt')
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    expect(sincronizzabile()).toBe(false)
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

describe('confrontaCloud', () => {
  const orgRec = (version: number): OrgRecord => ({ codice: 'ABC123', doc: '{}', version, updatedAt: '' })
  afterEach(() => localStorage.removeItem('sessione'))

  it('senza sessione -> offline', async () => {
    localStorage.removeItem('sessione')
    expect((await confrontaCloud('t1')).stato).toBe('offline')
  })

  it('cloud più recente e nessuna modifica locale -> cloud_avanti', async () => {
    localStorage.setItem('sessione', 'x')
    await saveTournament({ ...torneo, orgVersion: 2, orgPending: false })
    const r = await confrontaCloud('t1', fakeClient({ getOrg: async () => orgRec(5) }))
    expect(r).toEqual({ stato: 'cloud_avanti', versioneCloud: 5 })
  })

  it('cloud più recente con pending e struttura diversa -> conflitto', async () => {
    localStorage.setItem('sessione', 'x')
    await saveTournament({ ...torneo, orgVersion: 2, orgPending: true })
    // orgRec ha doc '{}' → struttura diversa dal locale → conflitto
    expect((await confrontaCloud('t1', fakeClient({ getOrg: async () => orgRec(5) }))).stato).toBe('conflitto')
  })

  it('cloud più recente con pending ma stessa struttura (solo punteggi) -> cloud_avanti', async () => {
    localStorage.setItem('sessione', 'x')
    await saveTournament({ ...torneo, orgVersion: 2, orgPending: true })
    const doc = await buildOrgDoc('t1')
    const rec: OrgRecord = { codice: 'ABC123', doc: JSON.stringify(doc), version: 5, updatedAt: '' }
    expect((await confrontaCloud('t1', fakeClient({ getOrg: async () => rec }))).stato).toBe('cloud_avanti')
  })

  it('stessa versione senza pending -> inpari', async () => {
    localStorage.setItem('sessione', 'x')
    await saveTournament({ ...torneo, orgVersion: 5, orgPending: false })
    expect((await confrontaCloud('t1', fakeClient({ getOrg: async () => orgRec(5) }))).stato).toBe('inpari')
  })

  it('modifiche locali non ancora inviate -> locale_pendente', async () => {
    localStorage.setItem('sessione', 'x')
    await saveTournament({ ...torneo, orgVersion: 5, orgPending: true })
    expect((await confrontaCloud('t1', fakeClient({ getOrg: async () => orgRec(5) }))).stato).toBe('locale_pendente')
  })
})
