import { useCallback, useEffect, useState } from 'react'
import { confrontaCloud, tiraOrg, onSyncCambiato, type EsitoConfronto } from '../services/orgSync'
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
    const check = () =>
      void confrontaCloud(tournamentId).then((r) => {
        if (!annullato) setStato(r.stato)
      })
    check()
    // Reagisce alle modifiche locali e all'esito dei push automatici, così la
    // pillola non resta stantìa (A7) e un push fallito non passa inosservato (A2).
    const off = onSyncCambiato((tid) => {
      if (tid === tournamentId) check()
    })
    return () => {
      annullato = true
      off()
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
  if (stato === 'errore') {
    return (
      <span className="sync-stato sync-stato-conflitto" role="status">
        Sincronizzazione non riuscita
        <Button variant="ghost" onClick={() => void aggiorna()} disabled={occupato}>
          {occupato ? 'Riprovo…' : 'Riprova'}
        </Button>
      </span>
    )
  }
  return null
}
