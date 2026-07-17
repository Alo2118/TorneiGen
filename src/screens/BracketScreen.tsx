import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament, teamsOf, groupsOf, matchesOf, replaceGenerated, saveTournament } from '../db/repositories'
import { generaTorneo } from '../services/generation'
import { salvaEProppaga } from '../services/saveResult'
import { generaFaseFinale } from '../services/faseFinale'
import { pubblicaSeAttivo } from '../services/pubblicazione'
import { mappaEtichette } from '../services/teams'
import { notificaModificaOrg } from '../services/orgSync'
import { useToast } from '../components/Toast'
import { Button } from '../components/Button'
import { MatchRow } from '../components/MatchRow'
import { ScoreControl } from '../components/ScoreControl'
import { BracketTree } from '../components/BracketTree'
import type { Match, SetScore } from '../engine/types'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function elementiFocusabili(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

export function BracketScreen() {
  const { id } = useParams()
  const toast = useToast()
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])
  const teams = useLiveQuery(() => teamsOf(id ?? ''), [id], [])
  const groups = useLiveQuery(() => groupsOf(id ?? ''), [id], [])
  const matches = useLiveQuery(() => matchesOf(id ?? ''), [id], [])

  const [errore, setErrore] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [generandoFinale, setGenerandoFinale] = useState(false)
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
  const teamNames: Record<string, string> = mappaEtichette(teams, torneo.tipologia)
  const confermate = teams.filter((t) => t.stato === 'confermata')
  const inAttesa = teams.filter((t) => t.stato === 'in_attesa')

  async function handleGenera() {
    if (!torneo) return
    if (confermate.length < 2) {
      setErrore('Servono almeno due squadre confermate per generare il calendario.')
      return
    }
    if (matches.length > 0) {
      if (!window.confirm('Rigenerare il calendario? Le partite esistenti verranno sostituite.')) return
    }
    setErrore(null)
    setGenerando(true)
    try {
      const { groups: nuoviGruppi, matches: nuovePartite } = generaTorneo(torneo, confermate)
      await replaceGenerated(torneo.id, nuoviGruppi, nuovePartite)
      await saveTournament({ ...torneo, stato: 'in_corso' })
      notificaModificaOrg(torneo.id)
      void pubblicaSeAttivo(torneo.id)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore durante la generazione')
    } finally {
      setGenerando(false)
    }
  }

  const matchGironi = matches.filter((m) => m.fase === 'girone')
  const matchTabellone = matches.filter((m) => m.fase === 'tabellone')
  const puoGenerareFinale =
    torneo.formato === 'gironi_eliminazione' &&
    matchGironi.length > 0 &&
    matchGironi.every((m) => m.stato === 'conclusa') &&
    matchTabellone.length === 0

  async function handleGeneraFinale() {
    if (!id) return
    setGenerandoFinale(true)
    try {
      await generaFaseFinale(id)
      toast('Fase finale generata')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Errore durante la generazione della fase finale', 'errore')
    } finally {
      setGenerandoFinale(false)
    }
  }

  const haGironi = groups.length > 0
  const haTabellone = matchTabellone.length > 0
  const matchPerGirone = haGironi
    ? groups.map((g) => ({ chiave: g.id, titolo: g.nome, partite: matchGironi.filter((m) => m.groupId === g.id) }))
    : []

  function renderPartite(partite: Match[]) {
    return partite.map((m) => (
      <MatchRow
        key={m.id}
        match={m}
        teamNames={teamNames}
        onModifica={m.teamAId && m.teamBId ? apriModifica : undefined}
      />
    ))
  }

  function renderGruppi(gruppi: { chiave: string; titolo: string; partite: Match[] }[]) {
    return gruppi.map((g) => (
      <section key={g.chiave} className="bracket-group">
        <h2>{g.titolo}</h2>
        <ul className="match-list">{renderPartite(g.partite)}</ul>
      </section>
    ))
  }

  return (
    <section className="bracket">
      <header className="bracket-head">
        <h1>Calendario / Tabellone</h1>
        <div className="bracket-head-actions">
          <Button type="button" onClick={handleGenera} disabled={isKotc || generando || confermate.length < 2}>
            {matches.length > 0 ? 'Rigenera' : 'Genera'}
          </Button>
          {puoGenerareFinale && (
            <Button type="button" onClick={handleGeneraFinale} disabled={generandoFinale}>
              Genera fase finale
            </Button>
          )}
        </div>
      </header>

      {isKotc && <p className="muted">King of the Court non è ancora disponibile (in arrivo prossimamente).</p>}
      {!isKotc && confermate.length < 2 && (
        <p className="muted">Servono almeno due squadre confermate per generare il calendario.</p>
      )}
      {!isKotc && inAttesa.length > 0 && (
        <p className="muted">
          {inAttesa.length === 1
            ? '1 squadra in attesa non inclusa nel calendario'
            : `${inAttesa.length} squadre in attesa non incluse nel calendario`}
          {' — confermale nella schermata '}
          <Link to={`/tornei/${id}/squadre`}>Squadre</Link>.
        </p>
      )}
      {errore && (
        <p className="field-error" role="alert">
          {errore}
        </p>
      )}

      {matches.length === 0 ? (
        <p className="empty">Nessuna partita generata ancora.</p>
      ) : (
        <>
          {haGironi && <div className="bracket-groups">{renderGruppi(matchPerGirone)}</div>}
          {haTabellone && (
            <section className="bracket-section">
              <h2 className="bracket-section-title">Tabellone</h2>
              <BracketTree
                matches={matchTabellone}
                teamNames={teamNames}
                variant="interattivo"
                onMatchClick={apriModifica}
              />
            </section>
          )}
        </>
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
