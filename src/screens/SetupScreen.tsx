import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Field } from '../components/Field'
import { Button } from '../components/Button'
import { getTournament, saveTournament } from '../db/repositories'
import { newId } from '../engine/id'
import type { Formato, RegolePunteggio, Tipologia, Tournament } from '../engine/types'

const FORMATI: { value: Formato; label: string }[] = [
  { value: 'girone_italiana', label: "Girone all'italiana" },
  { value: 'gironi_eliminazione', label: 'Gironi + eliminazione' },
  { value: 'eliminazione_diretta', label: 'Eliminazione diretta' },
  { value: 'king_of_the_court', label: 'King of the court' },
]

const REGOLE_DEFAULT: RegolePunteggio = {
  setAlMeglioDi: 1,
  puntiSet: 21,
  puntiTieBreak: 15,
  vittoriaConDue: true,
}

export function SetupScreen() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [nome, setNome] = useState('')
  const [tipologia, setTipologia] = useState<Tipologia>('2x2')
  const [formato, setFormato] = useState<Formato>('girone_italiana')
  const [data, setData] = useState('')
  const [regole, setRegole] = useState<RegolePunteggio>(REGOLE_DEFAULT)
  const [pronto, setPronto] = useState(!id)

  useEffect(() => {
    if (!id) {
      setPronto(true)
      return
    }
    let attivo = true
    getTournament(id).then((t) => {
      if (!attivo || !t) return
      setNome(t.nome)
      setTipologia(t.tipologia)
      setFormato(t.formato)
      setData(t.data)
      setRegole(t.regolePunteggio)
      setPronto(true)
    })
    return () => {
      attivo = false
    }
  }, [id])

  function aggiornaRegole(patch: Partial<RegolePunteggio>) {
    setRegole((r) => ({ ...r, ...patch }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const esistente = id ? await getTournament(id) : undefined
    const tournamentId = esistente?.id ?? id ?? newId()
    const torneo: Tournament = {
      id: tournamentId,
      nome,
      tipologia,
      formato,
      data,
      stato: esistente?.stato ?? 'bozza',
      regolePunteggio: regole,
      codiceIscrizione: esistente?.codiceIscrizione ?? newId().slice(0, 6).toUpperCase(),
    }
    await saveTournament(torneo)
    navigate(`/tornei/${tournamentId}/squadre`)
  }

  if (!pronto) return null

  return (
    <section className="setup">
      <header className="setup-head">
        <h1>{id ? 'Modifica torneo' : 'Nuovo torneo'}</h1>
      </header>

      <form className="setup-form" onSubmit={handleSubmit}>
        <Field
          label="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
        />

        <div className="rules-grid">
          <label className="field">
            <span className="field-label">Tipologia</span>
            <select
              className="field-input"
              value={tipologia}
              onChange={(e) => setTipologia(e.target.value as Tipologia)}
            >
              <option value="2x2">2x2</option>
              <option value="4x4">4x4</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Formato</span>
            <select
              className="field-input"
              value={formato}
              onChange={(e) => setFormato(e.target.value as Formato)}
            >
              {FORMATI.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            {formato === 'king_of_the_court' && (
              <span className="muted">Generazione disponibile a breve</span>
            )}
          </label>
        </div>

        <Field
          label="Data"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />

        <fieldset className="setup-rules">
          <legend>Regole punteggio</legend>
          <div className="rules-grid">
            <label className="field">
              <span className="field-label">Set al meglio di</span>
              <select
                className="field-input"
                value={regole.setAlMeglioDi}
                onChange={(e) => aggiornaRegole({ setAlMeglioDi: Number(e.target.value) as 1 | 3 })}
              >
                <option value={1}>1</option>
                <option value={3}>3</option>
              </select>
            </label>

            <Field
              label="Punti a set"
              type="number"
              min={1}
              value={regole.puntiSet}
              onChange={(e) => aggiornaRegole({ puntiSet: Number(e.target.value) })}
            />

            <Field
              label="Punti tie-break"
              type="number"
              min={1}
              value={regole.puntiTieBreak}
              onChange={(e) => aggiornaRegole({ puntiTieBreak: Number(e.target.value) })}
            />

            <Field
              label="Cap"
              type="number"
              min={1}
              value={regole.cap ?? ''}
              onChange={(e) =>
                aggiornaRegole({ cap: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </div>

          <label className="field field-checkbox">
            <input
              type="checkbox"
              className="field-input"
              checked={regole.vittoriaConDue}
              onChange={(e) => aggiornaRegole({ vittoriaConDue: e.target.checked })}
            />
            <span className="field-label">Vittoria a 2 di scarto</span>
          </label>
        </fieldset>

        <div className="setup-actions">
          <Button type="submit">Salva</Button>
        </div>
      </form>
    </section>
  )
}
