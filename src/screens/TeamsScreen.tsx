import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Field } from '../components/Field'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { db } from '../db/database'
import { teamsOf, getTournament } from '../db/repositories'
import { newId } from '../engine/id'
import { numeroGiocatori, validaSquadra, etichettaSquadra } from '../services/teams'
import { notificaModificaOrg } from '../services/orgSync'
import type { Player, Team } from '../engine/types'

function emptyPlayer(): Player {
  return { nome: '', cognome: '', email: '', telefono: '' }
}

export function TeamsScreen() {
  const { id } = useParams()
  const squadre = useLiveQuery(() => teamsOf(id ?? ''), [id], [])
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (torneo && editingId === null && players.length === 0) {
      setPlayers(Array.from({ length: numeroGiocatori(torneo.tipologia).min }, emptyPlayer))
    }
  }, [torneo, editingId, players.length])

  if (!id || !torneo) return null

  const tournamentId = id
  const tipologia = torneo.tipologia
  const { min, max } = numeroGiocatori(tipologia)

  function resetForm() {
    setNome('')
    setPlayers(Array.from({ length: min }, emptyPlayer))
    setErrore(null)
    setEditingId(null)
  }

  function startEdit(team: Team) {
    setEditingId(team.id)
    setNome(team.nome)
    setPlayers(team.players)
    setErrore(null)
  }

  function updatePlayer(index: number, patch: Partial<Player>) {
    setPlayers((ps) => ps.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function addPlayerRow() {
    setPlayers((ps) => (ps.length < max ? [...ps, emptyPlayer()] : ps))
  }

  function removePlayerRow(index: number) {
    setPlayers((ps) => (ps.length > min ? ps.filter((_, i) => i !== index) : ps))
  }

  async function handleSeed(team: Team, raw: string) {
    const testaDiSerie = raw === '' ? undefined : Number(raw)
    await db.teams.put({ ...team, testaDiSerie })
    if (id) notificaModificaOrg(id)
  }

  async function handleConfirm(teamId: string) {
    await db.teams.update(teamId, { stato: 'confermata' })
    if (id) notificaModificaOrg(id)
  }

  async function handleRemove(teamId: string) {
    if (!window.confirm('Rimuovere questa squadra?')) return
    await db.teams.delete(teamId)
    if (id) notificaModificaOrg(id)
    if (editingId === teamId) resetForm()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const esistente = editingId ? squadre.find((t) => t.id === editingId) : undefined
    const team: Team = {
      id: editingId ?? newId(),
      tournamentId,
      nome,
      players,
      testaDiSerie: esistente?.testaDiSerie,
      stato: 'confermata',
      origine: 'manuale',
    }
    const messaggio = validaSquadra(team, tipologia)
    if (messaggio) {
      setErrore(messaggio)
      return
    }
    await db.teams.put(team)
    if (id) notificaModificaOrg(id)
    resetForm()
  }

  const puoAggiungereRiga = players.length < max
  const puoRimuovereRiga = players.length > min

  return (
    <section className="teams">
      <header className="teams-head">
        <h1>Squadre</h1>
        <p className="muted">
          {min === max ? `${min} giocatori per squadra` : `Da ${min} a ${max} giocatori per squadra`}
        </p>
      </header>

      {squadre.length === 0 ? (
        <p className="empty">Nessuna squadra ancora. Aggiungine una per iniziare.</p>
      ) : (
        <ul className="team-list">
          {squadre.map((team) => (
            <li key={team.id} className="team-card">
              <div className="team-card-head">
                <h3>{etichettaSquadra(team, tipologia)}</h3>
                <div className="team-card-badges">
                  <Badge>{team.players.length} giocatori</Badge>
                  {team.stato === 'confermata' ? (
                    <span className="badge badge-confermata">Confermata</span>
                  ) : (
                    <span className="badge badge-in-attesa">In attesa</span>
                  )}
                </div>
              </div>
              <ul className="player-list">
                {team.players.map((p, i) => (
                  <li key={i} className="muted">
                    {p.nome} {p.cognome}
                  </li>
                ))}
              </ul>
              <div className="team-card-actions">
                <Field
                  label="Testa di serie"
                  id={`seed-${team.id}`}
                  type="number"
                  min={1}
                  value={team.testaDiSerie ?? ''}
                  onChange={(e) => handleSeed(team, e.target.value)}
                />
                <div className="team-card-buttons">
                  {team.stato === 'in_attesa' && (
                    <Button type="button" variant="primary" onClick={() => handleConfirm(team.id)}>
                      Conferma
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={() => startEdit(team)}>
                    Modifica
                  </Button>
                  <Button type="button" variant="danger" onClick={() => handleRemove(team.id)}>
                    Rimuovi
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="team-form" onSubmit={handleSubmit}>
        <h2>{editingId ? 'Modifica squadra' : 'Aggiungi squadra'}</h2>

        <Field
          label={tipologia === '2x2' ? 'Nome squadra (facoltativo)' : 'Nome squadra'}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required={tipologia !== '2x2'}
        />

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

        <div className="team-form-actions">
          {editingId && (
            <Button type="button" variant="ghost" onClick={resetForm}>
              Annulla
            </Button>
          )}
          <Button type="submit">{editingId ? 'Salva modifiche' : 'Aggiungi squadra'}</Button>
        </div>
      </form>
    </section>
  )
}
