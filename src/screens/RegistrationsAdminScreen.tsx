import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament } from '../db/repositories'
import { getClient, getReadToken } from '../services/config'
import { Button } from '../components/Button'
import type { Riepilogo } from '../types/registrations'

export function RegistrationsAdminScreen() {
  const { id } = useParams()
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])

  const [riepilogo, setRiepilogo] = useState<Riepilogo | null>(null)
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [copiato, setCopiato] = useState(false)

  if (!id || !torneo) return null

  const tokenMancante = !getReadToken()

  async function pubblica(chiuso: boolean) {
    if (!torneo) return
    setCaricando(true)
    setErrore(null)
    setCopiato(false)
    try {
      const r: Riepilogo = {
        codice: torneo.codiceIscrizione,
        nome: torneo.nome,
        tipologia: torneo.tipologia,
        formato: torneo.formato,
        chiuso,
        updatedAt: new Date().toISOString(),
      }
      const salvato = await getClient().pubblicaRiepilogo(r)
      setRiepilogo(salvato)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto')
    } finally {
      setCaricando(false)
    }
  }

  const linkPubblico = riepilogo ? `${window.location.origin}/iscrizione/${riepilogo.codice}` : null

  async function copiaLink() {
    if (!linkPubblico) return
    if (!navigator.clipboard) return
    await navigator.clipboard.writeText(linkPubblico)
    setCopiato(true)
  }

  return (
    <section className="registrations">
      <header className="registrations-head">
        <h1>Iscrizioni</h1>
        <p className="muted">Apri le iscrizioni per condividere un link pubblico dove i partecipanti possono registrarsi.</p>
      </header>

      {tokenMancante && (
        <p className="field-error" role="alert">
          Manca il token di lettura: configuralo nelle <Link to="/impostazioni">impostazioni</Link> per poter pubblicare le iscrizioni.
        </p>
      )}

      <div className="registrations-actions">
        <Button onClick={() => pubblica(false)} disabled={caricando || tokenMancante}>
          Apri iscrizioni
        </Button>
        <Button variant="ghost" onClick={() => pubblica(true)} disabled={caricando || tokenMancante}>
          Chiudi iscrizioni
        </Button>
      </div>

      {errore && (
        <p className="field-error" role="alert">
          {errore}
        </p>
      )}

      {riepilogo && linkPubblico && (
        <div className="registrations-link">
          <p className="muted">
            Iscrizioni {riepilogo.chiuso ? 'chiuse' : 'aperte'}. Link pubblico:
          </p>
          <div className="registrations-link-row">
            <code className="registrations-link-value">{linkPubblico}</code>
            <Button variant="ghost" onClick={copiaLink}>
              Copia
            </Button>
          </div>
          {copiato && <span className="muted" role="status">Copiato</span>}
        </div>
      )}
    </section>
  )
}
