import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../db/database'
import { saveTournament, getTournament } from '../db/repositories'
import { notificaModificaOrg } from './orgSync'
import type { RegistrationsClient } from './registrations-api'
import type { Tournament } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-20',
  stato: 'in_corso', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123', qualificatiPerGirone: 'tutti',
}
function fakeClient(putOrg: RegistrationsClient['putOrg']): RegistrationsClient {
  return { getOrg: async () => null, putOrg, deleteOrg: async () => {} } as unknown as RegistrationsClient
}

beforeEach(async () => {
  await Promise.all([db.tournaments.clear(), db.matches.clear()])
  await saveTournament(torneo)
  localStorage.setItem('writeToken', 'wt') // rende sincronizzabile() true (jsdom: navigator.onLine = true)
})
afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('notificaModificaOrg', () => {
  it('imposta orgPending=true', async () => {
    notificaModificaOrg('t1', fakeClient(async () => ({ conflitto: false, version: 1 })))
    await vi.waitFor(async () => {
      const t = await getTournament('t1')
      expect(t?.orgPending).toBe(true)
    })
  })

  it('coalizza più chiamate ravvicinate in un solo push', async () => {
    vi.useFakeTimers()
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 1 }))
    const client = fakeClient(putOrg)
    notificaModificaOrg('t1', client)
    notificaModificaOrg('t1', client)
    notificaModificaOrg('t1', client)
    await vi.advanceTimersByTimeAsync(1600)
    expect(putOrg).toHaveBeenCalledTimes(1)
  })
})
