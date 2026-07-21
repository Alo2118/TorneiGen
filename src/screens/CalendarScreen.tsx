import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament, teamsOf, matchesOf } from '../db/repositories'
import { programmaCalendario } from '../services/calendario'
import { nuovaCollocazione } from '../engine/calendarGrid'
import { db } from '../db/database'
import { useToast } from '../components/Toast'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { CalendarGrid } from '../components/CalendarGrid'
import { ScoreControl } from '../components/ScoreControl'
import { mappaEtichette } from '../services/teams'
import { notificaModificaOrg, tiraOrg } from '../services/orgSync'
import { salvaEProppaga } from '../services/saveResult'
import type { Match, Team, SetScore } from '../engine/types'

function nomeSquadra(id: string | null, teamNames: Record<string, string>): string {
  if (!id) return 'Da definire'
  return teamNames[id] ?? id
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
  const [matchInPunteggio, setMatchInPunteggio] = useState<Match | null>(null)
  const [aggiornando, setAggiornando] = useState(false)

  if (!id || !torneo) return null

  const teamNames: Record<string, string> = mappaEtichette(teams, torneo.tipologia)
  const partiteProgrammate = matches.filter((m): m is Match & { orario: string } => !!m.orario)

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
    notificaModificaOrg(inSpostamento.tournamentId)
    toast('Partita spostata')
    chiudiSposta()
  }

  async function handleSpostaSuCella(m: Match, cella: { data: string; orario: string; campo: string }) {
    const { orario, campo } = nuovaCollocazione(cella.data, cella.orario, cella.campo)
    await db.matches.update(m.id, { orario, campo })
    notificaModificaOrg(m.tournamentId)
    toast('Partita spostata')
  }

  async function handleSalvaPunteggio(set: SetScore[]) {
    if (!matchInPunteggio || !torneo) return
    await salvaEProppaga(torneo.id, matchInPunteggio.id, set, torneo.regolePunteggio)
    toast('Punteggio salvato')
    setMatchInPunteggio(null)
  }

  async function handleAggiorna() {
    if (!torneo) return
    setAggiornando(true)
    try {
      const esito = await tiraOrg(torneo.id)
      if (esito.stato === 'aggiornato') toast('Risultati aggiornati dal cloud')
      else if (esito.stato === 'sincronizzato') toast('Sincronizzato')
      else if (esito.stato === 'inpari') toast('Già tutto aggiornato')
      else if (esito.stato === 'conflitto') toast('Conflitto: risolvilo nel Riepilogo', 'errore')
      else toast('Impossibile aggiornare (offline o non connesso)', 'errore')
    } finally {
      setAggiornando(false)
    }
  }

  return (
    <section className="bracket">
      <header className="bracket-head">
        <h1>Calendario</h1>
        <div className="bracket-head-actions">
          <Button type="button" variant="ghost" onClick={handleAggiorna} disabled={aggiornando}>
            {aggiornando ? 'Aggiorno…' : 'Aggiorna risultati'}
          </Button>
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

      {partiteProgrammate.length === 0 ? (
        <p className="empty">Nessuna partita programmata ancora.</p>
      ) : (
        <CalendarGrid matches={matches} teamNames={teamNames} onPunteggio={(m) => setMatchInPunteggio(m)} onSposta={apriSposta} onSpostaSuCella={handleSpostaSuCella} />
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

      {matchInPunteggio && (
        <Modal
          open
          titolo={`${nomeSquadra(matchInPunteggio.teamAId, teamNames)} vs ${nomeSquadra(matchInPunteggio.teamBId, teamNames)}`}
          onClose={() => setMatchInPunteggio(null)}
        >
          <ScoreControl regole={torneo.regolePunteggio} setIniziali={matchInPunteggio.set} onSalva={handleSalvaPunteggio} tuttiISet={matchInPunteggio.fase === 'girone' && !!torneo.regolePunteggio.gironiPerSet} />
        </Modal>
      )}
    </section>
  )
}
