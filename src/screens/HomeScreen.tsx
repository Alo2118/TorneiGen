import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listTournaments } from '../db/repositories'
import { caricaDalCloud } from '../services/orgSync'
import { getWriteToken } from '../services/config'
import { Button } from '../components/Button'
import { Field } from '../components/Field'

export function HomeScreen() {
  const tornei = useLiveQuery(listTournaments, [], [])
  const navigate = useNavigate()
  const [apertoCarica, setApertoCarica] = useState(false)
  const [codice, setCodice] = useState('')
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function handleCarica() {
    setErrore(null)
    if (!getWriteToken()) {
      setErrore('Imposta prima il token di scrittura nelle Impostazioni.')
      return
    }
    const c = codice.trim().toUpperCase()
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
      setErrore('Errore di connessione o token non valido.')
    } finally {
      setCaricando(false)
    }
  }

  return (
    <section className="home">
      <header className="home-head">
        <h1>Tornei</h1>
        <div className="home-head-azioni">
          <Button variant="ghost" onClick={() => setApertoCarica((v) => !v)}>Carica dal cloud</Button>
          <Link to="/tornei/nuovo"><Button>Nuovo torneo</Button></Link>
        </div>
      </header>

      {apertoCarica && (
        <div className="home-carica">
          <Field
            label="Codice torneo"
            value={codice}
            onChange={(e) => { setCodice(e.target.value); setErrore(null) }}
            placeholder="es. ABC123"
          />
          <div className="home-carica-azioni">
            <Button onClick={() => void handleCarica()} disabled={caricando}>
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
