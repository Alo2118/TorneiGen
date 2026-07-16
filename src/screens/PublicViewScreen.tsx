import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getClient } from '../services/config'
import { GironeStandings } from '../components/GironeStandings'
import { BracketTree } from '../components/BracketTree'
import { PublicCalendar } from '../components/PublicCalendar'
import { Button } from '../components/Button'
import type { PublicSnapshot } from '../types/public'
import type { Group } from '../engine/types'

function oraLocale(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export function PublicViewScreen() {
  const { codice } = useParams()
  const [snap, setSnap] = useState<PublicSnapshot | null>(null)
  const [caricando, setCaricando] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async () => {
    if (!codice) return
    try {
      const s = await getClient().getSnapshot(codice)
      setSnap(s)
      setErrore(null)
    } catch {
      setErrore('Torneo non trovato o non ancora pubblicato.')
    } finally {
      setCaricando(false)
    }
  }, [codice])

  useEffect(() => {
    carica()
    const onFocus = () => carica()
    window.addEventListener('focus', onFocus)
    const id = window.setInterval(carica, 60000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(id)
    }
  }, [carica])

  if (caricando && !snap) return <section className="public-view"><p className="muted">Caricamento…</p></section>
  if (errore && !snap) return <section className="public-view"><p className="empty">{errore}</p></section>
  if (!snap) return null

  const teamNames: Record<string, string> = Object.fromEntries(snap.teams.map((t) => [t.id, t.nome]))
  const qualificati = snap.qualificatiPerGirone ?? 'tutti'
  const matchTabellone = snap.matches.filter((m) => m.fase === 'tabellone')

  return (
    <section className="public-view">
      <header className="public-view-head">
        <h1>{snap.nome}</h1>
        <div className="public-view-meta">
          <span className="muted">Aggiornato alle {oraLocale(snap.updatedAt)}</span>
          <Button type="button" variant="ghost" onClick={carica}>Aggiorna</Button>
        </div>
      </header>

      {snap.groups.length > 0 && (
        <div className="standings-groups">
          {snap.groups.map((g) => {
            const group: Group = { id: g.id, nome: g.nome, tournamentId: snap.codice, teamIds: g.teamIds }
            return (
              <GironeStandings
                key={g.id}
                group={group}
                matches={snap.matches}
                regole={snap.regolePunteggio}
                teamNames={teamNames}
                qualificati={qualificati}
              />
            )
          })}
        </div>
      )}

      {matchTabellone.length > 0 && (
        <section className="standings-bracket">
          <h2>Tabellone</h2>
          <BracketTree matches={matchTabellone} teamNames={teamNames} variant="statico" />
        </section>
      )}

      <PublicCalendar matches={snap.matches} teamNames={teamNames} />
    </section>
  )
}
