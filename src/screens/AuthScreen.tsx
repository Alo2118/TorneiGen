import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field } from '../components/Field'
import { Button } from '../components/Button'
import { accedi, registra } from '../services/auth'

type Modalita = 'accedi' | 'registrati'

export function AuthScreen() {
  const navigate = useNavigate()
  const [modalita, setModalita] = useState<Modalita>('accedi')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [societa, setSocieta] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [attesa, setAttesa] = useState(false)

  function cambiaModalita(m: Modalita) {
    setModalita(m)
    setErrore(null)
    setAttesa(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setInviando(true)
    try {
      if (modalita === 'accedi') {
        await accedi(email, password)
        navigate('/')
      } else {
        const { inAttesa } = await registra(email, password, societa)
        if (inAttesa) {
          setAttesa(true)
        } else {
          navigate('/')
        }
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto')
    } finally {
      setInviando(false)
    }
  }

  return (
    <section className="setup">
      <header className="setup-head">
        <h1>Accedi o registrati</h1>
      </header>

      <div className="setup-actions" role="tablist" aria-label="Modalità">
        <Button
          type="button"
          role="tab"
          aria-selected={modalita === 'accedi'}
          variant={modalita === 'accedi' ? 'primary' : 'ghost'}
          onClick={() => cambiaModalita('accedi')}
        >
          Accedi
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={modalita === 'registrati'}
          variant={modalita === 'registrati' ? 'primary' : 'ghost'}
          onClick={() => cambiaModalita('registrati')}
        >
          Registrati
        </Button>
      </div>

      {attesa ? (
        <p role="status">Account creato: in attesa di abilitazione</p>
      ) : (
        <form className="setup-form" onSubmit={handleSubmit}>
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={modalita === 'accedi' ? 'current-password' : 'new-password'}
          />

          {modalita === 'registrati' && (
            <Field
              label="Organizzazione (società)"
              value={societa}
              onChange={(e) => setSocieta(e.target.value)}
              required
            />
          )}

          {errore && (
            <p className="field-error" role="alert">
              {errore}
            </p>
          )}

          <div className="setup-actions">
            <Button type="submit" disabled={inviando}>
              {inviando ? 'Attendere…' : modalita === 'accedi' ? 'Accedi' : 'Crea account'}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
