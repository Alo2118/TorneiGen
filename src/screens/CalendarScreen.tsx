import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament, teamsOf, matchesOf } from '../db/repositories'
import { programmaCalendario } from '../services/calendario'
import { db } from '../db/database'
import { useToast } from '../components/Toast'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import type { Match, Team } from '../engine/types'

function nomeSquadra(id: string | null, teamNames: Record<string, string>): string {
  if (!id) return 'Da definire'
  return teamNames[id] ?? id
}

function formattaData(data: string): string {
  const d = new Date(`${data}T00:00:00`)
  if (Number.isNaN(d.getTime())) return data
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function CalendarScreen() {
  const { id } = useParams()
  const toast = useToast()
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])
  const teams = useLiveQuery(() => teamsOf(id ?? ''), [id], [] as Team[])
  const matches = useLiveQuery(() => matchesOf(id ?? ''), [id], [] as Match[])

  const [programmando, setProgrammando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inSpostamento, setInSpostamento] = useState<Match | null>(null)
  const [nuovoOrario, setNuovoOrario] = useState('')
  const [nuovoCampo, setNuovoCampo] = useState('')

  if (!id || !torneo) return null

  const teamNames: Record<string, string> = Object.fromEntries(teams.map((t) => [t.id, t.nome]))
  const partiteProgrammate = matches.filter((m): m is Match & { orario: string } => !!m.orario)

  const giornateChiavi = [...new Set(partiteProgrammate.map((m) => m.orario.slice(0, 10)))].sort()
  const giornate = giornateChiavi.map((chiave) => ({
    chiave,
    partite: partiteProgrammate
      .filter((m) => m.orario.slice(0, 10) === chiave)
      .sort((a, b) => a.orario.localeCompare(b.orario)),
  }))

  async function handleProgramma() {
    if (!id) return
    setErrore(null)
    setProgrammando(true)
    try {
      const numero = await programmaCalendario(id)
      toast(`Calendario programmato: ${numero} ${numero === 1 ? 'partita' : 'partite'}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore durante la programmazione del calendario'
      setErrore(msg)
      toast(msg, 'errore')
    } finally {
      setProgrammando(false)
    }
  }

  function apriSposta(match: Match) {
    setInSpostamento(match)
    setNuovoOrario(match.orario ?? '')
    setNuovoCampo(match.campo ?? '')
  }

  function chiudiSposta() {
    setInSpostamento(null)
    setNuovoOrario('')
    setNuovoCampo('')
  }

  async function handleSalvaSposta() {
    if (!inSpostamento) return
    if (!nuovoOrario) {
      toast('Inserisci un orario valido', 'errore')
      return
    }
    await db.matches.update(inSpostamento.id, { orario: nuovoOrario, campo: nuovoCampo })
    toast('Partita spostata')
    chiudiSposta()
  }

  return (
    <section className="bracket">
      <header className="bracket-head">
        <h1>Calendario</h1>
        <div className="bracket-head-actions">
          <Button type="button" onClick={handleProgramma} disabled={programmando}>
            {partiteProgrammate.length > 0 ? 'Rigenera calendario' : 'Programma calendario'}
          </Button>
        </div>
      </header>

      {errore && (
        <p className="field-error" role="alert">
          {errore}
        </p>
      )}

      {giornate.length === 0 ? (
        <p className="empty">Nessuna partita programmata ancora.</p>
      ) : (
        <div className="bracket-groups">
          {giornate.map((g) => (
            <section key={g.chiave} className="bracket-group">
              <h2>{formattaData(g.chiave)}</h2>
              <ul className="match-list">
                {g.partite.map((m) => (
                  <li key={m.id} className="calendar-row">
                    <span className="calendar-row-orario tnum">{m.orario.slice(11)}</span>
                    <span className="calendar-row-campo">{m.campo || 'Campo da definire'}</span>
                    <span className="calendar-row-teams">
                      <span>{nomeSquadra(m.teamAId, teamNames)}</span>{' '}
                      <span className="muted">vs</span>{' '}
                      <span>{nomeSquadra(m.teamBId, teamNames)}</span>
                    </span>
                    <Button type="button" variant="ghost" onClick={() => apriSposta(m)}>
                      Sposta
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {inSpostamento && (
        <Modal
          open
          titolo={`${nomeSquadra(inSpostamento.teamAId, teamNames)} vs ${nomeSquadra(inSpostamento.teamBId, teamNames)}`}
          onClose={chiudiSposta}
        >
          <label className="field" htmlFor="sposta-orario">
            <span className="field-label">Orario</span>
            <input
              id="sposta-orario"
              className="field-input"
              type="datetime-local"
              value={nuovoOrario}
              onChange={(e) => setNuovoOrario(e.target.value)}
            />
          </label>
          <label className="field" htmlFor="sposta-campo">
            <span className="field-label">Campo</span>
            <input
              id="sposta-campo"
              className="field-input"
              type="text"
              value={nuovoCampo}
              onChange={(e) => setNuovoCampo(e.target.value)}
            />
          </label>
          <div className="score-control-actions">
            <Button type="button" onClick={handleSalvaSposta}>
              Salva
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}
