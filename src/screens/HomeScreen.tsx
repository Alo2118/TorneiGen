import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listTournaments } from '../db/repositories'
import { caricaDalCloud, elencoTorneiCloud } from '../services/orgSync'
import { getSessione } from '../services/config'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import type { TorneoCloud } from '../services/registrations-api'

export function HomeScreen() {
  const tornei = useLiveQuery(listTournaments, [], [])
  const navigate = useNavigate()
  const [apertoCarica, setApertoCarica] = useState(false)
  const [codice, setCodice] = useState('')
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [cloud, setCloud] = useState<TorneoCloud[] | null>(null)
  const [caricandoElenco, setCaricandoElenco] = useState(false)

  async function apriCarica() {
    const nuovoStato = !apertoCarica
    setApertoCarica(nuovoStato)
    if (!nuovoStato) return
    setErrore(null)
    if (!getSessione()) {
      setCloud(null)
      return
    }
    setCaricandoElenco(true)
    try {
      setCloud(await elencoTorneiCloud())
    } catch {
      setCloud(null)
      setErrore('Impossibile leggere l’elenco dal cloud. Puoi comunque caricare per codice.')
    } finally {
      setCaricandoElenco(false)
    }
  }

  async function caricaCodice(c: string) {
    setErrore(null)
    if (!getSessione()) {
      setErrore('Accedi prima per caricare un torneo dal cloud (Impostazioni → Accedi).')
      return
    }
    if (!c) return
    setCaricando(true)
    try {
      const id = await caricaDalCloud(c)
      if (!id) {
        setErrore('Nessun torneo con questo codice nel cloud.')
        return
      }
      navigate(`/tornei/${id}`)
    } catch {
      setErrore('Errore di connessione o sessione non valida.')
    } finally {
      setCaricando(false)
    }
  }

  function handleCarica() {
    void caricaCodice(codice.trim().toUpperCase())
  }

  return (
    <section className="home">
      <header className="home-head">
        <h1>Tornei</h1>
        <div className="home-head-azioni">
          <Button variant="ghost" onClick={() => void apriCarica()}>Carica dal cloud</Button>
          <Link to="/tornei/nuovo"><Button>Nuovo torneo</Button></Link>
        </div>
      </header>

      {apertoCarica && (
        <div className="home-carica">
          {!getSessione() ? (
            <p className="muted">Accedi per vedere i tuoi tornei nel cloud (Impostazioni → Accedi).</p>
          ) : caricandoElenco ? (
            <p className="muted">Caricamento elenco…</p>
          ) : cloud && cloud.length > 0 ? (
            <>
              <p className="muted">I tuoi tornei dal cloud:</p>
              <ul className="cloud-list">
                {cloud.map((t) => (
                  <li key={t.codice}>
                    <Button variant="ghost" disabled={caricando} onClick={() => void caricaCodice(t.codice)}>
                      {t.nome}
                      {t.tipologia ? ` · ${t.tipologia}` : ''}
                      {t.data ? ` · ${t.data}` : ''}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            cloud && <p className="muted">Nessun torneo nel cloud per la tua società.</p>
          )}

          <Field
            label="Oppure carica per codice"
            value={codice}
            onChange={(e) => { setCodice(e.target.value); setErrore(null) }}
            placeholder="es. ABC123"
          />
          <div className="home-carica-azioni">
            <Button onClick={handleCarica} disabled={caricando}>
              {caricando ? 'Caricamento…' : 'Carica'}
            </Button>
          </div>
          {errore && <p className="verifica-esito verifica-esito-errore" role="alert">✗ {errore}</p>}
        </div>
      )}

      {tornei.length === 0 ? (
        <p className="empty">Nessun torneo ancora. Creane uno per iniziare.</p>
      ) : (
        <ul className="card-grid">
          {tornei.map((t) => (
            <li key={t.id} className="card">
              <Link to={`/tornei/${t.id}`} className="card-link">
                <h3>{t.nome}</h3>
                <p className="muted">{t.tipologia} · {t.formato.replace(/_/g, ' ')} · {t.data}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
