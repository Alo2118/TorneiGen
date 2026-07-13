import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './database'
import type { Tournament } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Test', tipologia: '2x2', formato: 'girone_italiana',
  data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123',
}

describe('db', () => {
  beforeEach(async () => {
    await db.tournaments.clear()
  })

  it('salva e rilegge un torneo', async () => {
    await db.tournaments.put(torneo)
    const letto = await db.tournaments.get('t1')
    expect(letto?.nome).toBe('Test')
  })
})
