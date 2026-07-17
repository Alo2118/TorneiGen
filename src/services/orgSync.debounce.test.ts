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
  // Nota: il writeToken (che rende sincronizzabile() true) va impostato dai singoli
  // test che ne hanno bisogno, per evitare di schedulare timer reali fuori controllo.
})
afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('notificaModificaOrg', () => {
  it('marca orgPending anche a sync spenta (senza push)', async () => {
    // Nessun writeToken: sincronizzabile() è false, quindi nessun timer viene schedulato.
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 1 }))
    notificaModificaOrg('t1', fakeClient(putOrg))
    await vi.waitFor(async () => {
      const t = await getTournament('t1')
      expect(t?.orgPending).toBe(true)
    })
    expect(putOrg).not.toHaveBeenCalled()
  })

  it('marca orgPending quando la sync è attiva', async () => {
    localStorage.setItem('writeToken', 'wt') // rende sincronizzabile() true (jsdom: navigator.onLine = true)
    // Solo setTimeout/clearTimeout sono finti: fake-indexeddb usa setImmediate
    // internamente e deve continuare a girare con i timer reali.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 1 }))
    const client = fakeClient(putOrg)
    notificaModificaOrg('t1', client)
    // Flush della scrittura async di marcaPending (IndexedDB reale, timer di debounce finto).
    await vi.waitFor(async () => {
      const t = await getTournament('t1')
      expect(t?.orgPending).toBe(true)
    })
    // Drena il timer di debounce schedulato, per non lasciarlo pendente.
    await vi.advanceTimersByTimeAsync(1600)
  })

  it('coalizza più chiamate ravvicinate in un solo push', async () => {
    localStorage.setItem('writeToken', 'wt') // rende sincronizzabile() true (jsdom: navigator.onLine = true)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const putOrg = vi.fn(async () => ({ conflitto: false, version: 1 }))
    const client = fakeClient(putOrg)
    notificaModificaOrg('t1', client)
    notificaModificaOrg('t1', client)
    notificaModificaOrg('t1', client)
    await vi.advanceTimersByTimeAsync(1600)
    // spingiOrg (fire-and-forget) usa IndexedDB reale (setImmediate): attende il suo esito.
    await vi.waitFor(() => {
      expect(putOrg).toHaveBeenCalledTimes(1)
    })
  })
})
