import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Field } from '../components/Field'
import { Button } from '../components/Button'
import { getClient } from '../services/config'
import { utenteCorrente } from '../services/auth'
import type { UtenteAmministrato, Societa } from '../services/registrations-api'

const STATO_LABEL: Record<'utente' | 'admin', string> = { utente: 'Utente', admin: 'Admin' }

export function AdminScreen() {
  const [verificando, setVerificando] = useState(true)
  const [ammesso, setAmmesso] = useState(false)

  const [utenti, setUtenti] = useState<UtenteAmministrato[] | null>(null)
  const [societa, setSocieta] = useState<Societa[] | null>(null)
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [nuovaSocieta, setNuovaSocieta] = useState('')

  useEffect(() => {
    let cancellato = false
    utenteCorrente().then((u) => {
      if (cancellato) return
      setAmmesso(u?.ruolo === 'admin')
      setVerificando(false)
    })
    return () => {
      cancellato = true
    }
  }, [])

  async function carica() {
    setCaricando(true)
    setErrore(null)
    try {
      const [u, s] = await Promise.all([getClient().elencoUtenti(), getClient().elencoSocieta()])
      setUtenti(u)
      setSocieta(s)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto')
    } finally {
      setCaricando(false)
    }
  }

  useEffect(() => {
    if (ammesso) void carica()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ammesso])

  async function handleCreaSocieta(e: FormEvent) {
    e.preventDefault()
    const nome = nuovaSocieta.trim()
    if (!nome) return
    setErrore(null)
    try {
      await getClient().creaSocieta(nome)
      setNuovaSocieta('')
      await carica()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto')
    }
  }

  async function handleAbilita(utenteId: string, societaId: string) {
    setErrore(null)
    try {
      await getClient().abilitaUtente(utenteId, societaId)
      await carica()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto')
    }
  }

  if (verificando) return null
  if (!ammesso) return <p role="alert">Accesso riservato</p>

  return (
    <section className="registrations">
      <header className="registrations-head">
        <h1>Amministrazione</h1>
        <p className="muted">Abilita gli utenti in attesa e gestisci le società.</p>
      </header>

      {errore && (
        <p className="field-error" role="alert">
          {errore}
        </p>
      )}

      <div className="registrations-import">
        <h2>Società</h2>
        {societa && societa.length > 0 && (
          <ul className="registrations-import-list">
            {societa.map((s) => (
              <li key={s.id} className="registrations-import-item">
                {s.nome}
              </li>
            ))}
          </ul>
        )}
        <form className="setup-form" onSubmit={handleCreaSocieta}>
          <Field
            label="Nuova società"
            value={nuovaSocieta}
            onChange={(e) => setNuovaSocieta(e.target.value)}
          />
          <div className="registrations-actions">
            <Button type="submit" disabled={!nuovaSocieta.trim()}>
              Crea società
            </Button>
          </div>
        </form>
      </div>

      <div className="registrations-import">
        <h2>Utenti</h2>
        {caricando && <p className="muted">Caricamento…</p>}
        {utenti && utenti.length === 0 && <p className="muted">Nessun utente</p>}
        {utenti && utenti.length > 0 && (
          <ul className="registrations-import-list">
            {utenti.map((u) => (
              <UtenteRiga key={u.id} utente={u} societaList={societa ?? []} onAbilita={handleAbilita} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function UtenteRiga({
  utente,
  societaList,
  onAbilita,
}: {
  utente: UtenteAmministrato
  societaList: Societa[]
  onAbilita: (utenteId: string, societaId: string) => Promise<void>
}) {
  const [scelta, setScelta] = useState('')
  const [nuova, setNuova] = useState('')
  const [inviando, setInviando] = useState(false)
  const [erroreRiga, setErroreRiga] = useState<string | null>(null)

  const societaAssegnata = societaList.find((s) => s.id === utente.societaId)?.nome

  async function abilita() {
    setErroreRiga(null)
    setInviando(true)
    try {
      let societaId = scelta
      if (!societaId && nuova.trim()) {
        const creata = await getClient().creaSocieta(nuova.trim())
        societaId = creata.id
      }
      if (!societaId) {
        setErroreRiga('Scegli o crea una società')
        return
      }
      await onAbilita(utente.id, societaId)
    } catch (err) {
      setErroreRiga(err instanceof Error ? err.message : 'Errore imprevisto')
    } finally {
      setInviando(false)
    }
  }

  return (
    <li className="registrations-import-item">
      <div>
        <strong>{utente.email}</strong> — {STATO_LABEL[utente.ruolo]} —{' '}
        {utente.abilitato ? 'attivo' : 'in attesa'}
        {societaAssegnata && <> — {societaAssegnata}</>}
        {!utente.abilitato && utente.societaRichiesta && (
          <div className="muted">Società richiesta: {utente.societaRichiesta}</div>
        )}
      </div>

      {!utente.abilitato && (
        <div className="registrations-actions">
          <label className="field" htmlFor={`societa-${utente.id}`}>
            <span className="field-label">{`Società per ${utente.email}`}</span>
            <select
              id={`societa-${utente.id}`}
              className="field-input"
              value={scelta}
              onChange={(e) => setScelta(e.target.value)}
            >
              <option value="">— scegli società —</option>
              {societaList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
          <Field
            label={`Nuova società per ${utente.email}`}
            value={nuova}
            onChange={(e) => setNuova(e.target.value)}
          />
          <Button onClick={abilita} disabled={inviando || (!scelta && !nuova.trim())}>
            Abilita
          </Button>
        </div>
      )}
      {erroreRiga && (
        <p className="field-error" role="alert">
          {erroreRiga}
        </p>
      )}
    </li>
  )
}
