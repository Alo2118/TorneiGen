import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/database'
import { caricaDalCloud } from './orgSync'
import type { RegistrationsClient } from './registrations-api'
import type { OrgDoc, OrgRecord } from '../types/org'
import type { Tournament } from '../engine/types'

const torneo: Tournament = {
  id: 'remoto-1', nome: 'Coppa Cloud', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'CLOUD1', qualificatiPerGirone: 'tutti',
}
const doc: OrgDoc = { tournament: torneo, teams: [], groups: [], struttura: [] }
function fakeClient(record: OrgRecord | null): RegistrationsClient {
  return { getOrg: async () => record, putOrg: async () => ({ conflitto: false, version: 1 }), deleteOrg: async () => {} } as unknown as RegistrationsClient
}

beforeEach(async () => {
  await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
})

describe('caricaDalCloud', () => {
  it('crea il torneo locale dal documento e ritorna il suo id', async () => {
    const record: OrgRecord = { codice: 'CLOUD1', doc: JSON.stringify(doc), version: 2, updatedAt: 'x' }
    const id = await caricaDalCloud('CLOUD1', fakeClient(record))
    expect(id).toBe('remoto-1')
    const t = await db.tournaments.get('remoto-1')
    expect(t?.nome).toBe('Coppa Cloud')
    expect(t?.orgVersion).toBe(2)
    expect(t?.orgPending).toBe(false)
  })

  it('ritorna null se il codice non esiste nel cloud', async () => {
    const id = await caricaDalCloud('INESISTENTE', fakeClient(null))
    expect(id).toBeNull()
  })

  it('ritorna null (senza lanciare) se il doc cloud è JSON corrotto', async () => {
    const record: OrgRecord = { codice: 'CLOUD1', doc: 'nonjson{', version: 2, updatedAt: 'x' }
    const id = await caricaDalCloud('CLOUD1', fakeClient(record))
    expect(id).toBeNull()
  })
})
