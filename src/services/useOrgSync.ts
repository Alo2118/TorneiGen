import { useEffect, useState } from 'react'
import type { OrgDoc } from '../types/org'
import { tiraOrg, risolviConflittoUsaCloud, risolviConflittoSovrascrivi, sincronizzabile } from './orgSync'

export interface StatoConflitto {
  versioneCloud: number
  docCloud: OrgDoc
}
export interface OrgSync {
  conflitto: StatoConflitto | null
  risolviCloud: () => Promise<void>
  risolviLocale: () => Promise<void>
}

export function useOrgSync(tournamentId: string | undefined): OrgSync {
  const [conflitto, setConflitto] = useState<StatoConflitto | null>(null)

  useEffect(() => {
    if (!tournamentId || !sincronizzabile()) return
    let annullato = false
    // Niente ref di guardia: in StrictMode dev l'effetto viene invocato due
    // volte (mount→cleanup→remount). La prima invocazione viene annullata
    // dal proprio cleanup, la seconda ("vera") completa normalmente e
    // aggiorna lo stato. tiraOrg è una GET idempotente, quindi eseguirla due
    // volte in dev è innocuo; in produzione gira una sola volta.
    void tiraOrg(tournamentId).then((esito) => {
      if (annullato) return
      if (esito.stato === 'conflitto' && esito.docCloud && esito.versioneCloud !== undefined) {
        setConflitto({ versioneCloud: esito.versioneCloud, docCloud: esito.docCloud })
      }
    })
    return () => {
      annullato = true
    }
  }, [tournamentId])

  async function risolviCloud(): Promise<void> {
    if (!tournamentId || !conflitto) return
    await risolviConflittoUsaCloud(tournamentId, conflitto.docCloud, conflitto.versioneCloud)
    setConflitto(null)
  }
  async function risolviLocale(): Promise<void> {
    if (!tournamentId || !conflitto) return
    const esito = await risolviConflittoSovrascrivi(tournamentId, conflitto.versioneCloud)
    if (esito.stato === 'sincronizzato') setConflitto(null)
  }
  return { conflitto, risolviCloud, risolviLocale }
}
