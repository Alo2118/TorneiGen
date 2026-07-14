import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { getClient } from '../services/config'
import { numeroGiocatori, validaSquadra } from '../services/teams'
import { Field } from '../components/Field'
import { Button } from '../components/Button'
import type { Player, Team } from '../engine/types'
import type { Riepilogo } from '../types/registrations'

function emptyPlayer(): Player {
  return { nome: '', cognome: '', email: '', telefono: '' }
}

export function RegistrationScreen() {
  const { codice } = useParams()

  const [riepilogo, setRiepilogo] = useState<Riepilogo | null>(null)
  const [caricando, setCaricando] = useState(true)
  const [erroreCaricamento, setErroreCaricamento] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [inviata, setInviata] = useState(false)

  useEffect(() => {
    let attivo = true
    if (!codice) return
    setCaricando(true)
    setErroreCaricamento(null)
    getClient()
      .getRiepilogo(codice)
      .then((r) => {
        if (!attivo) return
        setRiepilogo(r)
        setPlayers(Array.from({ length: numeroGiocatori(r.tipologia).min }, emptyPlayer))
      })
      .catch(() => {
        if (!attivo) return
        setErroreCaricamento('Torneo non trovato')
      })
      .finally(() => {
        if (attivo) setCaricando(false)
      })
    return () => {
      attivo = false
    }
  }, [codice])

  function updatePlayer(index: number, patch: Partial<Player>) {
    setPlayers((ps) => ps.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function addPlayerRow() {
    if (!riepilogo) return
    const { max } = numeroGiocatori(riepilogo.tipologia)
    setPlayers((ps) => (ps.length < max ? [...ps, emptyPlayer()] : ps))
  }

  function removePlayerRow(index: number) {
    if (!riepilogo) return
    const { min } = numeroGiocatori(riepilogo.tipologia)
    setPlayers((ps) => (ps.length > min ? ps.filter((_, i) => i !== index) : ps))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!riepilogo || !codice) return
    const team: Team = {
      id: 'public',
      tournamentId: riepilogo.codice,
      nome,
      players,
      stato: 'in_attesa',
      origine: 'online',
    }
    const messaggio = validaSquadra(team, riepilogo.tipologia)
    if (messaggio) {
      setErrore(messaggio)
      return
    }
    setErrore(null)
    setInviando(true)
    try {
      await getClient().inviaIscrizione(codice, { nomeSquadra: nome, giocatori: players })
      setInviata(true)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto')
    } finally {
      setInviando(false)
    }
  }

  if (caricando) {
    return (
      <section className="registration-public">
        <p className="muted">Caricamento…</p>
      </section>
    )
  }

  if (erroreCaricamento || !riepilogo) {
    return (
      <section className="registration-public">
        <p className="field-error" role="alert">
          Torneo non trovato
        </p>
      </section>
    )
  }

  if (riepilogo.chiuso) {
    return (
      <section className="registration-public">
        <header className="registration-public-head">
          <h1>{riepilogo.nome}</h1>
        </header>
        <p className="muted">Le iscrizioni sono chiuse per questo torneo.</p>
      </section>
    )
  }

  if (inviata) {
    return (
      <section className="registration-public">
        <header className="registration-public-head">
          <h1>{riepilogo.nome}</h1>
        </header>
        <p role="status">Grazie! Iscrizione inviata.</p>
      </section>
    )
  }

  const { min, max } = numeroGiocatori(riepilogo.tipologia)
  const puoAggiungereRiga = players.length < max
  const puoRimuovereRiga = players.length > min

  return (
    <section className="registration-public">
      <header className="registration-public-head">
        <h1>{riepilogo.nome}</h1>
        <p className="muted">
          Iscrivi la tua squadra: {min === max ? `${min} giocatori` : `da ${min} a ${max} giocatori`}.
        </p>
      </header>

      <form className="registration-form" onSubmit={handleSubmit}>
        <Field label="Nome squadra" id="nome-squadra" value={nome} onChange={(e) => setNome(e.target.value)} required />

        <div className="player-rows">
          {players.map((p, i) => (
            <fieldset key={i} className="player-row">
              <legend>Giocatore {i + 1}</legend>
              <div className="player-row-fields">
                <Field
                  label="Nome"
                  id={`p${i}-nome`}
                  value={p.nome}
                  onChange={(e) => updatePlayer(i, { nome: e.target.value })}
                  required
                />
                <Field
                  label="Cognome"
                  id={`p${i}-cognome`}
                  value={p.cognome}
                  onChange={(e) => updatePlayer(i, { cognome: e.target.value })}
                  required
                />
                <Field
                  label="Email"
                  id={`p${i}-email`}
                  type="email"
                  value={p.email}
                  onChange={(e) => updatePlayer(i, { email: e.target.value })}
                  required
                />
                <Field
                  label="Telefono"
                  id={`p${i}-telefono`}
                  type="tel"
                  value={p.telefono}
                  onChange={(e) => updatePlayer(i, { telefono: e.target.value })}
                  required
                />
              </div>
              {puoRimuovereRiga && (
                <Button type="button" variant="ghost" onClick={() => removePlayerRow(i)}>
                  Rimuovi giocatore
                </Button>
              )}
            </fieldset>
          ))}
        </div>

        {puoAggiungereRiga && (
          <Button type="button" variant="ghost" onClick={addPlayerRow}>
            Aggiungi giocatore
          </Button>
        )}

        {errore && (
          <p className="field-error" role="alert">
            {errore}
          </p>
        )}

        <div className="registration-form-actions">
          <Button type="submit" disabled={inviando}>
            {inviando ? 'Invio in corso…' : 'Invia iscrizione'}
          </Button>
        </div>
      </form>
    </section>
  )
}
