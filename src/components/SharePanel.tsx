import { useState } from 'react'
import { Link } from 'react-router-dom'
import { pubblica, interrompiPubblicazione } from '../services/pubblicazione'
import { getSessione } from '../services/config'
import { QRCode } from './QRCode'
import { Button } from './Button'
import { useToast } from './Toast'
import type { Tournament } from '../engine/types'

interface Props {
  tournament: Tournament
}

export function SharePanel({ tournament }: Props) {
  const toast = useToast()
  const [inCorso, setInCorso] = useState(false)
  const link = `${window.location.origin}/pubblico/${tournament.codiceIscrizione}`
  const sessione = getSessione()

  async function handlePubblica() {
    if (!getSessione()) {
      toast('Accedi per pubblicare', 'errore')
      return
    }
    setInCorso(true)
    try {
      await pubblica(tournament.id)
      toast('Torneo pubblicato')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Errore durante la pubblicazione', 'errore')
    } finally {
      setInCorso(false)
    }
  }

  async function handleInterrompi() {
    setInCorso(true)
    try {
      await interrompiPubblicazione(tournament.id)
      toast('Pubblicazione interrotta')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Impossibile interrompere la pubblicazione', 'errore')
    } finally {
      setInCorso(false)
    }
  }

  async function copiaLink() {
    try {
      await navigator.clipboard.writeText(link)
      toast('Link copiato')
    } catch {
      toast('Impossibile copiare il link', 'errore')
    }
  }

  async function condividi() {
    if (navigator.share) {
      try {
        await navigator.share({ title: tournament.nome, url: link })
      } catch {
        // condivisione annullata: nessun errore da mostrare
      }
    } else {
      await copiaLink()
    }
  }

  if (!tournament.pubblicato) {
    return (
      <section className="share-panel">
        <h2>Condivisione pubblica</h2>
        <p className="muted">Pubblica il tabellone in sola lettura: i giocatori lo vedranno sul telefono col link. Si aggiorna da solo a ogni risultato.</p>
        {sessione ? (
          <Button type="button" onClick={handlePubblica} disabled={inCorso}>Pubblica</Button>
        ) : (
          <p className="muted">Accedi per pubblicare il tabellone. <Link to="/accesso">Accedi</Link></p>
        )}
      </section>
    )
  }

  return (
    <section className="share-panel">
      <h2>Condivisione pubblica</h2>
      <p className="muted">Pubblicazione automatica attiva. Condividi questo link con i giocatori:</p>
      <p className="share-link">{link}</p>
      <div className="share-actions">
        <Button type="button" variant="ghost" onClick={copiaLink}>Copia link</Button>
        <Button type="button" variant="ghost" onClick={condividi}>Condividi</Button>
        {sessione && (
          <Button type="button" variant="ghost" onClick={handleInterrompi} disabled={inCorso}>Interrompi pubblicazione</Button>
        )}
      </div>
      {!sessione && (
        <p className="muted">Accedi per gestire la pubblicazione. <Link to="/accesso">Accedi</Link></p>
      )}
      <QRCode value={link} />
    </section>
  )
}
