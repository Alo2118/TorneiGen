import { useState } from 'react'
import type { FormEvent } from 'react'
import { Field } from '../components/Field'
import { Button } from '../components/Button'
import { getSavedApiBaseUrl, getApiBaseUrl, getReadToken, setApiBaseUrl, setReadToken } from '../services/config'

export function SettingsScreen() {
  // Il valore mostrato è solo quello salvato esplicitamente: getApiBaseUrl()
  // applica un fallback (env/default) utile al client API ma non va mostrato
  // come se fosse già stato scelto dall'utente.
  const [apiBaseUrl, setApiBaseUrlValue] = useState(() => getSavedApiBaseUrl())
  const [readToken, setReadTokenValue] = useState(() => getReadToken() ?? '')
  const [salvato, setSalvato] = useState(false)
  const placeholderUrl = getApiBaseUrl()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setApiBaseUrl(apiBaseUrl)
    setReadToken(readToken)
    setSalvato(true)
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
          }}
          placeholder={placeholderUrl}
        />

        <Field
          label="Token di lettura"
          type="password"
          value={readToken}
          onChange={(e) => {
            setReadTokenValue(e.target.value)
            setSalvato(false)
          }}
          autoComplete="off"
        />
        <p className="muted">Serve solo a te per scaricare le iscrizioni; non condividerlo.</p>

        <div className="setup-actions">
          {salvato && <span className="muted" role="status">Salvato</span>}
          <Button type="submit">Salva</Button>
        </div>
      </form>
    </section>
  )
}
