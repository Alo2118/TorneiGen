import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { getTournament, teamsOf, saveTournament } from '../db/repositories'
import { getClient, getReadToken } from '../services/config'
import { nuoveIscrizioni, iscrizioneATeam } from '../services/import'
import { etichettaIscrizione } from '../services/teams'
import { notificaModificaOrg } from '../services/orgSync'
import { Button } from '../components/Button'
import type { Riepilogo, Iscrizione } from '../types/registrations'

export function RegistrationsAdminScreen() {
  const { id } = useParams()
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])

  const [riepilogo, setRiepilogo] = useState<Riepilogo | null>(null)
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [copiato, setCopiato] = useState(false)

  const [daImportare, setDaImportare] = useState<Iscrizione[] | null>(null)
  const [selezionate, setSelezionate] = useState<Set<string>>(new Set())
  const [scaricando, setScaricando] = useState(false)
  const [erroreImport, setErroreImport] = useState<string | null>(null)
  const [importate, setImportate] = useState<number | null>(null)
  const [importando, setImportando] = useState(false)

  useEffect(() => {
    if (!torneo || !torneo.codiceIscrizione) return
    let cancellato = false
    getClient()
      .getRiepilogo(torneo.codiceIscrizione)
      .then((r) => {
        if (!cancellato) setRiepilogo(r)
      })
      .catch(() => {
        // non ancora aperto (es. 404): nessun riepilogo pubblicato, nessun errore da mostrare
      })
    return () => {
      cancellato = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torneo?.codiceIscrizione])

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
      if (!chiuso && torneo.stato === 'bozza') {
        await saveTournament({ ...torneo, stato: 'iscrizioni_aperte' })
        notificaModificaOrg(torneo.id)
      } else if (chiuso && torneo.stato === 'iscrizioni_aperte') {
        await saveTournament({ ...torneo, stato: 'bozza' })
        notificaModificaOrg(torneo.id)
      }
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

  async function scaricaIscrizioni() {
    if (!torneo || !id) return
    setScaricando(true)
    setErroreImport(null)
    setImportate(null)
    try {
      const tutte = await getClient().elencaIscrizioni(torneo.codiceIscrizione)
      const esistenti = await teamsOf(id)
      const nuove = nuoveIscrizioni(tutte, esistenti, torneo.tipologia)
      setDaImportare(nuove)
      setSelezionate(new Set(nuove.map((i) => i.id)))
    } catch (err) {
      setErroreImport(err instanceof Error ? err.message : 'Errore imprevisto')
      setDaImportare(null)
    } finally {
      setScaricando(false)
    }
  }

  function toggleSelezione(iscrizioneId: string) {
    setSelezionate((prev) => {
      const next = new Set(prev)
      if (next.has(iscrizioneId)) next.delete(iscrizioneId)
      else next.add(iscrizioneId)
      return next
    })
  }

  async function importaSelezionate() {
    if (!id || !daImportare) return
    const scelte = daImportare.filter((i) => selezionate.has(i.id))
    if (scelte.length === 0) return
    setImportando(true)
    setErroreImport(null)
    try {
      await db.teams.bulkPut(scelte.map((i) => iscrizioneATeam(i, id)))
      notificaModificaOrg(id)
      setImportate(scelte.length)
      setDaImportare(null)
      setSelezionate(new Set())
    } catch (err) {
      setErroreImport(err instanceof Error ? err.message : 'Errore imprevisto')
    } finally {
      setImportando(false)
    }
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

      <div className="registrations-import">
        <h2>Iscrizioni ricevute</h2>
        <div className="registrations-actions">
          <Button variant="ghost" onClick={scaricaIscrizioni} disabled={scaricando || tokenMancante}>
            Scarica iscrizioni
          </Button>
        </div>

        {erroreImport && (
          <p className="field-error" role="alert">
            {erroreImport}
          </p>
        )}

        {importate !== null && (
          <p className="muted" role="status">
            {importate} squadre importate
          </p>
        )}

        {daImportare && daImportare.length === 0 && (
          <p className="muted">Nessuna nuova iscrizione</p>
        )}

        {daImportare && daImportare.length > 0 && (
          <>
            <ul className="registrations-import-list">
              {daImportare.map((i) => (
                <li key={i.id} className="registrations-import-item">
                  <label className="field field-checkbox">
                    <input
                      type="checkbox"
                      className="field-input"
                      checked={selezionate.has(i.id)}
                      onChange={() => toggleSelezione(i.id)}
                    />
                    <span className="field-label">{etichettaIscrizione(i, torneo.tipologia)}</span>
                  </label>
                  <span className="muted">{i.giocatori.map((g) => `${g.nome} ${g.cognome}`).join(', ')}</span>
                </li>
              ))}
            </ul>
            <div className="registrations-actions">
              <Button onClick={importaSelezionate} disabled={selezionate.size === 0 || importando}>
                Importa selezionate
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
