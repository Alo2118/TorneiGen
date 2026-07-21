import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Field } from '../components/Field'
import { Button } from '../components/Button'
import { getSavedApiBaseUrl, getApiBaseUrl, setApiBaseUrl } from '../services/config'
import { verificaConnessione } from '../services/verifica'
import { utenteCorrente, esci, type Utente } from '../services/auth'

export function SettingsScreen() {
  // Il valore mostrato è solo quello salvato esplicitamente: getApiBaseUrl()
  // applica un fallback (env/default) utile al client API ma non va mostrato
  // come se fosse già stato scelto dall'utente.
  const [apiBaseUrl, setApiBaseUrlValue] = useState(() => getSavedApiBaseUrl())
  const [salvato, setSalvato] = useState(false)
  const [verifica, setVerifica] = useState<{ ok: boolean; messaggio: string } | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [utente, setUtente] = useState<Utente | null>(null)
  const [caricandoUtente, setCaricandoUtente] = useState(true)
  const placeholderUrl = getApiBaseUrl()

  useEffect(() => {
    let attivo = true
    utenteCorrente()
      .then((u) => {
        if (attivo) setUtente(u)
      })
      .finally(() => {
        if (attivo) setCaricandoUtente(false)
      })
    return () => {
      attivo = false
    }
  }, [])

  function handleEsci() {
    esci()
    setUtente(null)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setApiBaseUrl(apiBaseUrl)
    setSalvato(true)
    setVerifica(null)
  }

  async function handleVerifica() {
    // Verifica i valori attualmente salvati: se ci sono modifiche non salvate,
    // salvale prima, così il test riflette davvero ciò che verrà usato dall'app.
    setApiBaseUrl(apiBaseUrl)
    setSalvato(true)
    setVerificando(true)
    setVerifica(null)
    try {
      const esito = await verificaConnessione()
      setVerifica(esito)
    } finally {
      setVerificando(false)
    }
  }

  return (
    <section className="setup">
      <header className="setup-head">
        <h1>Impostazioni</h1>
      </header>

      <div className="setup-form">
        {!caricandoUtente && (
          utente ? (
            <div className="setup-actions">
              <span className="muted">
                Accesso come {utente.email} ({utente.ruolo})
              </span>
              <Button type="button" variant="ghost" onClick={handleEsci}>
                Esci
              </Button>
            </div>
          ) : (
            <div className="setup-actions">
              <Link to="/accesso" className="btn btn-ghost">
                Accedi o registrati
              </Link>
            </div>
          )
        )}
      </div>

      <form className="setup-form" onSubmit={handleSubmit}>
        <Field
          label="URL API"
          value={apiBaseUrl}
          onChange={(e) => {
            setApiBaseUrlValue(e.target.value)
            setSalvato(false)
            setVerifica(null)
          }}
          placeholder={placeholderUrl}
        />
        <p className="muted">L'indirizzo del tuo Worker Cloudflare, quello che riceve le iscrizioni.</p>

        <div className="setup-actions">
          {salvato && <span className="muted" role="status">Salvato</span>}
          <Button type="submit">Salva</Button>
          <Button type="button" variant="ghost" onClick={handleVerifica} disabled={verificando}>
            {verificando ? 'Verifica in corso…' : 'Verifica connessione'}
          </Button>
        </div>

        {verifica && (
          <p
            className={verifica.ok ? 'verifica-esito verifica-esito-ok' : 'verifica-esito verifica-esito-errore'}
            role={verifica.ok ? 'status' : 'alert'}
          >
            {verifica.ok ? '✓ ' : '✗ '}{verifica.messaggio}
          </p>
        )}
      </form>

      <footer className="app-credit">© 2026 Alo · TorneiGen</footer>
    </section>
  )
}
