import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './database'
import { exportBackup, importBackup } from './backup'
import type { Tournament } from '../engine/types'

const torneo: Tournament = {
  id: 't1', nome: 'Test', tipologia: '2x2', formato: 'girone_italiana',
  data: '2026-07-13', stato: 'bozza',
  regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true },
  codiceIscrizione: 'ABC123',
}

describe('backup', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
  })

  it('esporta e reimporta un torneo completo', async () => {
    await db.tournaments.put(torneo)
    const data = await exportBackup('t1')
    await db.tournaments.clear()
    await importBackup(data)
    const letto = await db.tournaments.get('t1')
    expect(letto?.nome).toBe('Test')
  })
})
