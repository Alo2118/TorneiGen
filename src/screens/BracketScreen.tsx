import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament, teamsOf, groupsOf, matchesOf, replaceGenerated, saveTournament } from '../db/repositories'
import { generaTorneo } from '../services/generation'
import { salvaEProppaga } from '../services/saveResult'
import { Button } from '../components/Button'
import { MatchRow } from '../components/MatchRow'
import { ScoreControl } from '../components/ScoreControl'
import type { Match, SetScore } from '../engine/types'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function elementiFocusabili(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

export function BracketScreen() {
  const { id } = useParams()
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])
  const teams = useLiveQuery(() => teamsOf(id ?? ''), [id], [])
  const groups = useLiveQuery(() => groupsOf(id ?? ''), [id], [])
  const matches = useLiveQuery(() => matchesOf(id ?? ''), [id], [])

  const [errore, setErrore] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [matchInModifica, setMatchInModifica] = useState<Match | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  // Sposta il focus dentro il pannello quando il dialog si apre.
  useEffect(() => {
    if (!matchInModifica) return
    const panel = panelRef.current
    if (!panel) return
    const [primo] = elementiFocusabili(panel)
    ;(primo ?? panel).focus()
  }, [matchInModifica])

  // Ripristina il focus sul trigger quando il dialog si chiude.
  useEffect(() => {
    if (matchInModifica) return
    triggerRef.current?.focus()
    triggerRef.current = null
  }, [matchInModifica])

  if (!id || !torneo) return null

  function apriModifica(match: Match) {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setMatchInModifica(match)
  }

  function chiudiModifica() {
    setMatchInModifica(null)
  }

  function handleDialogKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      chiudiModifica()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusabili = elementiFocusabili(panel)
    if (focusabili.length === 0) return
    const primo = focusabili[0]
    const ultimo = focusabili[focusabili.length - 1]
    const attivo = document.activeElement
    if (e.shiftKey) {
      if (attivo === primo || !panel.contains(attivo)) {
        e.preventDefault()
        ultimo.focus()
      }
    } else if (attivo === ultimo || !panel.contains(attivo)) {
      e.preventDefault()
      primo.focus()
    }
  }

  async function handleSalva(set: SetScore[]) {
    if (!torneo || !matchInModifica) return
    await salvaEProppaga(torneo.id, matchInModifica.id, set, torneo.regolePunteggio)
    chiudiModifica()
  }

  const isKotc = torneo.formato === 'king_of_the_court'
  const teamNames: Record<string, string> = Object.fromEntries(teams.map((t) => [t.id, t.nome]))

  async function handleGenera() {
    if (!torneo) return
    if (matches.length > 0) {
      if (!window.confirm('Rigenerare il calendario? Le partite esistenti verranno sostituite.')) return
    }
    setErrore(null)
    setGenerando(true)
    try {
      const { groups: nuoviGruppi, matches: nuovePartite } = generaTorneo(torneo, teams)
      await replaceGenerated(torneo.id, nuoviGruppi, nuovePartite)
      await saveTournament({ ...torneo, stato: 'in_corso' })
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore durante la generazione')
    } finally {
      setGenerando(false)
    }
  }

  const haGironi = groups.length > 0
  const matchPerGirone = haGironi
    ? groups.map((g) => ({ chiave: g.id, titolo: g.nome, partite: matches.filter((m) => m.groupId === g.id) }))
    : []
  const round = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)
  const matchPerRound = !haGironi
    ? round.map((r) => ({ chiave: String(r), titolo: `Turno ${r}`, partite: matches.filter((m) => m.round === r) }))
    : []
  const gruppiDaMostrare = haGironi ? matchPerGirone : matchPerRound

  return (
    <section className="bracket">
      <header className="bracket-head">
        <h1>Calendario / Tabellone</h1>
        <div className="bracket-head-actions">
          <Button type="button" onClick={handleGenera} disabled={isKotc || generando || teams.length < 2}>
            {matches.length > 0 ? 'Rigenera' : 'Genera'}
          </Button>
        </div>
      </header>

      {isKotc && <p className="muted">King of the Court non è ancora disponibile (in arrivo prossimamente).</p>}
      {!isKotc && teams.length < 2 && <p className="muted">Servono almeno due squadre per generare il calendario.</p>}
      {errore && (
        <p className="field-error" role="alert">
          {errore}
        </p>
      )}

      {matches.length === 0 ? (
        <p className="empty">Nessuna partita generata ancora.</p>
      ) : (
        <div className="bracket-groups">
          {gruppiDaMostrare.map((g) => (
            <section key={g.chiave} className="bracket-group">
              <h2>{g.titolo}</h2>
              <ul className="match-list">
                {g.partite.map((m: Match) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    teamNames={teamNames}
                    onModifica={m.teamAId && m.teamBId ? apriModifica : undefined}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {matchInModifica && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Inserisci punteggio"
          onKeyDown={handleDialogKeyDown}
        >
          <div className="modal-panel" ref={panelRef} tabIndex={-1}>
            <div className="modal-head">
              <h2>
                {nomeSquadra(matchInModifica.teamAId, teamNames)} vs {nomeSquadra(matchInModifica.teamBId, teamNames)}
              </h2>
              <Button type="button" variant="ghost" onClick={chiudiModifica}>
                Annulla
              </Button>
            </div>
            <ScoreControl
              regole={torneo.regolePunteggio}
              setIniziali={matchInModifica.set}
              onSalva={handleSalva}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function nomeSquadra(id: string | null, teamNames: Record<string, string>): string {
  if (!id) return 'Da definire'
  return teamNames[id] ?? id
}
