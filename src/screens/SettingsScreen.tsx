import { useState } from 'react'
import type { FormEvent } from 'react'
import { Field } from '../components/Field'
import { Button } from '../components/Button'
import { getSavedApiBaseUrl, getApiBaseUrl, getReadToken, setApiBaseUrl, setReadToken, getWriteToken, setWriteToken } from '../services/config'
import { verificaConnessione } from '../services/verifica'

export function SettingsScreen() {
  // Il valore mostrato è solo quello salvato esplicitamente: getApiBaseUrl()
  // applica un fallback (env/default) utile al client API ma non va mostrato
  // come se fosse già stato scelto dall'utente.
  const [apiBaseUrl, setApiBaseUrlValue] = useState(() => getSavedApiBaseUrl())
  const [readToken, setReadTokenValue] = useState(() => getReadToken() ?? '')
  const [writeToken, setWriteTokenValue] = useState(() => getWriteToken() ?? '')
  const [salvato, setSalvato] = useState(false)
  const [verifica, setVerifica] = useState<{ ok: boolean; messaggio: string } | null>(null)
  const [verificando, setVerificando] = useState(false)
  const placeholderUrl = getApiBaseUrl()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setApiBaseUrl(apiBaseUrl)
    setReadToken(readToken)
    setWriteToken(writeToken)
    setSalvato(true)
    setVerifica(null)
  }

  async function handleVerifica() {
    // Verifica i valori attualmente salvati: se ci sono modifiche non salvate,
    // salvale prima, così il test riflette davvero ciò che verrà usato dall'app.
    setApiBaseUrl(apiBaseUrl)
    setReadToken(readToken)
    setWriteToken(writeToken)
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

        <Field
          label="Token di lettura"
          type="password"
          value={readToken}
          onChange={(e) => {
            setReadTokenValue(e.target.value)
            setSalvato(false)
            setVerifica(null)
          }}
          autoComplete="off"
        />
        <p className="muted">La chiave privata del tuo deploy: si imposta una volta e serve solo a te per scaricare le iscrizioni; non condividerla.</p>

        <Field
          label="Token di scrittura"
          type="password"
          value={writeToken}
          onChange={(e) => {
            setWriteTokenValue(e.target.value)
            setSalvato(false)
            setVerifica(null)
          }}
          autoComplete="off"
        />
        <p className="muted">Serve a sincronizzare l'organizzazione del torneo tra i tuoi dispositivi. È più potente del token di lettura: tienilo privato.</p>

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
    </section>
  )
}
