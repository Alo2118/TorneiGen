import { useCallback, useEffect, useState } from 'react'
import { confrontaCloud, tiraOrg, type EsitoConfronto } from '../services/orgSync'
import { Button } from './Button'

/**
 * Pillola di stato sincronizzazione nell'header del torneo: segnala se ci sono
 * aggiornamenti dal cloud (con pulsante "Aggiorna"), modifiche locali da inviare
 * o un conflitto. Silenziosa quando è tutto allineato/offline.
 */
export function SyncStato({ tournamentId }: { tournamentId: string }) {
  const [stato, setStato] = useState<EsitoConfronto | null>(null)
  const [occupato, setOccupato] = useState(false)

  const controlla = useCallback(async () => {
    setStato((await confrontaCloud(tournamentId)).stato)
  }, [tournamentId])

  useEffect(() => {
    let annullato = false
    void confrontaCloud(tournamentId).then((r) => {
      if (!annullato) setStato(r.stato)
    })
    return () => {
      annullato = true
    }
  }, [tournamentId])

  async function aggiorna() {
    setOccupato(true)
    try {
      await tiraOrg(tournamentId)
      await controlla()
    } finally {
      setOccupato(false)
    }
  }

  if (stato === 'cloud_avanti') {
    return (
      <span className="sync-stato sync-stato-avviso" role="status">
        Aggiornamenti dal cloud
        <Button variant="ghost" onClick={() => void aggiorna()} disabled={occupato}>
          {occupato ? 'Aggiorno…' : 'Aggiorna'}
        </Button>
      </span>
    )
  }
  if (stato === 'conflitto') {
    return (
      <span className="sync-stato sync-stato-conflitto" role="status">
        Conflitto: risolvilo nel Riepilogo
      </span>
    )
  }
  if (stato === 'locale_pendente') {
    return (
      <span className="sync-stato" role="status">
        Modifiche locali da sincronizzare…
      </span>
    )
  }
  if (stato === 'inpari') {
    return (
      <span className="sync-stato sync-stato-ok" role="status">
        Sincronizzato
      </span>
    )
  }
  return null
}
