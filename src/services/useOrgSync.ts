import { useEffect, useRef, useState } from 'react'
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
  const fatto = useRef<string | null>(null)

  useEffect(() => {
    if (!tournamentId || !sincronizzabile()) return
    if (fatto.current === tournamentId) return
    fatto.current = tournamentId
    let annullato = false
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
    await risolviConflittoSovrascrivi(tournamentId, conflitto.versioneCloud)
    setConflitto(null)
  }
  return { conflitto, risolviCloud, risolviLocale }
}
