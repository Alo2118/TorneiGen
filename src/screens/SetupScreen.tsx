import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Field } from '../components/Field'
import { Button } from '../components/Button'
import { getTournament, saveTournament } from '../db/repositories'
import { newId } from '../engine/id'
import type { Formato, RegolePunteggio, Tipologia, Tournament } from '../engine/types'

const QUALIFICATI_OPZIONI = [1, 2, 3, 4]

const FORMATI: { value: Formato; label: string }[] = [
  { value: 'girone_italiana', label: "Girone all'italiana" },
  { value: 'gironi_eliminazione', label: 'Gironi + eliminazione' },
  { value: 'eliminazione_diretta', label: 'Eliminazione diretta' },
  { value: 'eliminazione_doppia', label: 'Eliminazione doppia' },
  { value: 'king_of_the_court', label: 'King of the court' },
]

const REGOLE_DEFAULT: RegolePunteggio = {
  setAlMeglioDi: 1,
  puntiSet: 21,
  puntiTieBreak: 15,
  vittoriaConDue: true,
}

type GiornataForm = { data: string; inizio: string; fine: string }

function giornataDefault(data: string): GiornataForm {
  return { data, inizio: '19:00', fine: '23:00' }
}

export function SetupScreen() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [nome, setNome] = useState('')
  const [tipologia, setTipologia] = useState<Tipologia>('2x2')
  const [formato, setFormato] = useState<Formato>('girone_italiana')
  const [data, setData] = useState('')
  const [regole, setRegole] = useState<RegolePunteggio>(REGOLE_DEFAULT)
  const [giornate, setGiornate] = useState<GiornataForm[]>([giornataDefault('')])
  const [numeroCampi, setNumeroCampi] = useState(1)
  const [durataPartitaMin, setDurataPartitaMin] = useState(30)
  const [faseFinale, setFaseFinale] = useState<'diretta' | 'doppia'>('diretta')
  const [qualificatiPerGirone, setQualificatiPerGirone] = useState<number | 'tutti'>('tutti')
  const [pronto, setPronto] = useState(!id)

  useEffect(() => {
    if (!id) {
      setPronto(true)
      return
    }
    let attivo = true
    getTournament(id).then((t) => {
      if (!attivo) return
      if (!t) {
        navigate('/')
        return
      }
      setNome(t.nome)
      setTipologia(t.tipologia)
      setFormato(t.formato)
      setData(t.data)
      setRegole(t.regolePunteggio)
      setGiornate(t.giornate && t.giornate.length > 0 ? t.giornate : [giornataDefault(t.data)])
      setNumeroCampi(t.numeroCampi ?? 1)
      setDurataPartitaMin(t.durataPartitaMin ?? 30)
      setFaseFinale(t.faseFinale ?? 'diretta')
      setQualificatiPerGirone(t.qualificatiPerGirone ?? 'tutti')
      setPronto(true)
    })
    return () => {
      attivo = false
    }
  }, [id, navigate])

  function aggiornaRegole(patch: Partial<RegolePunteggio>) {
    setRegole((r) => ({ ...r, ...patch }))
  }

  function aggiornaGiornata(index: number, patch: Partial<GiornataForm>) {
    setGiornate((gs) => gs.map((g, i) => (i === index ? { ...g, ...patch } : g)))
  }

  function aggiungiGiornata() {
    setGiornate((gs) => [...gs, giornataDefault(data)])
  }

  function rimuoviGiornata(index: number) {
    setGiornate((gs) => (gs.length > 1 ? gs.filter((_, i) => i !== index) : gs))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const esistente = id ? await getTournament(id) : undefined
    const tournamentId = esistente?.id ?? id ?? newId()
    const giornateFinali = giornate.map((g) => ({ ...g, data: g.data || data }))
    const torneo: Tournament = {
      id: tournamentId,
      nome,
      tipologia,
      formato,
      data,
      stato: esistente?.stato ?? 'bozza',
      regolePunteggio: regole,
      codiceIscrizione: esistente?.codiceIscrizione ?? newId().slice(0, 6).toUpperCase(),
      giornate: giornateFinali,
      numeroCampi,
      durataPartitaMin,
      faseFinale,
      qualificatiPerGirone,
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
          required
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
              id="cap"
              label="Cap (tetto punteggio)"
              hint="Facoltativo. Oltre questo punteggio basta 1 punto di scarto per chiudere il set (vale solo con «vittoria a 2 di scarto»). Lascia vuoto per nessun limite."
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

        <fieldset className="setup-rules">
          <legend>Calendario</legend>

          <div className="giornata-rows">
            {giornate.map((g, i) => (
              <fieldset key={i} className="giornata-row">
                <legend>Giornata {i + 1}</legend>
                <div className="giornata-row-fields">
                  <Field
                    label="Data"
                    id={`giornata-${i}-data`}
                    type="date"
                    value={g.data}
                    onChange={(e) => aggiornaGiornata(i, { data: e.target.value })}
                  />
                  <Field
                    label="Inizio"
                    id={`giornata-${i}-inizio`}
                    type="time"
                    value={g.inizio}
                    onChange={(e) => aggiornaGiornata(i, { inizio: e.target.value })}
                  />
                  <Field
                    label="Fine"
                    id={`giornata-${i}-fine`}
                    type="time"
                    value={g.fine}
                    onChange={(e) => aggiornaGiornata(i, { fine: e.target.value })}
                  />
                </div>
                {giornate.length > 1 && (
                  <Button type="button" variant="ghost" onClick={() => rimuoviGiornata(i)}>
                    Rimuovi giornata
                  </Button>
                )}
              </fieldset>
            ))}
          </div>

          <Button type="button" variant="ghost" onClick={aggiungiGiornata}>
            Aggiungi giornata
          </Button>

          <div className="rules-grid">
            <Field
              label="Numero campi"
              type="number"
              min={1}
              value={numeroCampi}
              onChange={(e) => setNumeroCampi(Number(e.target.value))}
            />

            <Field
              label="Durata partita (min)"
              type="number"
              min={1}
              value={durataPartitaMin}
              onChange={(e) => setDurataPartitaMin(Number(e.target.value))}
            />
          </div>
        </fieldset>

        {formato === 'gironi_eliminazione' && (
          <fieldset className="setup-rules">
            <legend>Fase finale</legend>
            <div className="rules-grid">
              <label className="field" htmlFor="fase-finale">
                <span className="field-label">Fase finale</span>
                <select
                  id="fase-finale"
                  className="field-input"
                  value={faseFinale}
                  onChange={(e) => setFaseFinale(e.target.value as 'diretta' | 'doppia')}
                >
                  <option value="diretta">Eliminazione diretta</option>
                  <option value="doppia">Eliminazione doppia</option>
                </select>
              </label>

              <label className="field" htmlFor="qualificati-per-girone">
                <span className="field-label">Qualificati per girone</span>
                <select
                  id="qualificati-per-girone"
                  className="field-input"
                  value={qualificatiPerGirone}
                  onChange={(e) =>
                    setQualificatiPerGirone(
                      e.target.value === 'tutti' ? 'tutti' : Number(e.target.value),
                    )
                  }
                >
                  <option value="tutti">Tutti</option>
                  {QUALIFICATI_OPZIONI.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {faseFinale === 'doppia' && (
                  <span className="field-hint">
                    L'eliminazione doppia richiede un numero totale di qualificati potenza di 2 (2, 4, 8...). Se non lo è, riduci i qualificati o usa la diretta.
                  </span>
                )}
              </label>
            </div>
          </fieldset>
        )}

        <div className="setup-actions">
          <Button type="submit">Salva</Button>
        </div>
      </form>
    </section>
  )
}
