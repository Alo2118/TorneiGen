import { useState } from 'react'
import type { Match } from '../engine/types'
import { buildCalendarGrid, CAMPO_VUOTO } from '../engine/calendarGrid'
import type { CellaGriglia } from '../engine/calendarGrid'
import { usePointerDrag } from '../services/usePointerDrag'

interface Props {
  matches: Match[]
  teamNames: Record<string, string>
  onPunteggio?: (match: Match) => void
  onSposta?: (match: Match) => void
  onSpostaSuCella?: (m: Match, cella: { data: string; orario: string; campo: string }) => void
}

function nome(id: string | null, names: Record<string, string>): string {
  return id ? names[id] ?? id : 'Da definire'
}
function formattaData(data: string): string {
  const d = new Date(`${data}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? data
    : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}
function etichettaCampo(campo: string): string {
  return campo === CAMPO_VUOTO ? campo : `Campo ${campo}`
}

const chiaveCella = (data: string, orario: string, campo: string): string => `${data}|${orario}|${campo}`

function cellaDaPunto(x: number, y: number): { data: string; orario: string; campo: string } | null {
  const el = document.elementFromPoint(x, y)
  const cella = el?.closest('[data-data]') as HTMLElement | null
  const { data, orario, campo } = cella?.dataset ?? {}
  if (!data || !orario || campo === undefined) return null
  return { data, orario, campo }
}

function MatchCardCalendario({ match, teamNames, onPunteggio, onSposta, onSpostaSuCella, onEvidenzia }: {
  match: Match
  teamNames: Record<string, string>
  onPunteggio?: (m: Match) => void
  onSposta?: (m: Match) => void
  onSpostaSuCella?: (m: Match, cella: { data: string; orario: string; campo: string }) => void
  onEvidenzia: (chiave: string | null) => void
}) {
  const origine = { data: match.orario!.slice(0, 10), orario: match.orario!.slice(11, 16), campo: match.campo && match.campo.trim() !== '' ? match.campo : CAMPO_VUOTO }
  const { trascinando, handlers } = usePointerDrag({
    onMuovi: (x, y) => {
      const c = cellaDaPunto(x, y)
      onEvidenzia(c ? chiaveCella(c.data, c.orario, c.campo) : null)
    },
    onRilascia: (x, y) => {
      onEvidenzia(null)
      const c = cellaDaPunto(x, y)
      if (!c || !onSpostaSuCella) return
      if (c.data === origine.data && c.orario === origine.orario && c.campo === origine.campo) return
      onSpostaSuCella(match, c)
    },
  })
  const testo = `${nome(match.teamAId, teamNames)} — ${nome(match.teamBId, teamNames)}`
  const risultato = match.set.length > 0 ? match.set.map((s) => `${s.puntiA}–${s.puntiB}`).join(' ') : null
  const interattiva = Boolean(onPunteggio || onSposta)
  const draggabile = Boolean(onSpostaSuCella)
  return (
    <div className={`calendar-grid-match${trascinando ? ' calendar-grid-match-dragging' : ''}`}>
      <span
        className={`calendar-grid-match-teams${draggabile ? ' calendar-grid-match-drag' : ''}`}
        {...(draggabile ? handlers : {})}
      >
        {testo}
      </span>
      {risultato && <span className="calendar-grid-match-score tnum">{risultato}</span>}
      {interattiva && (
        <div className="calendar-grid-match-actions">
          {onPunteggio && match.teamAId && match.teamBId && (
            <button type="button" className="calendar-grid-action" onClick={() => onPunteggio(match)}>Punteggio</button>
          )}
          {onSposta && (
            <button type="button" className="calendar-grid-action" onClick={() => onSposta(match)}>Sposta</button>
          )}
        </div>
      )}
    </div>
  )
}

export function CalendarGrid({ matches, teamNames, onPunteggio, onSposta, onSpostaSuCella }: Props) {
  const giornate = buildCalendarGrid(matches)
  const [evidenza, setEvidenza] = useState<string | null>(null)
  if (giornate.length === 0) return null

  const partiteDi = (celle: CellaGriglia[], orario: string, campo: string): Match[] =>
    celle.find((c) => c.orario === orario && c.campo === campo)?.partite ?? []

  return (
    <div className="calendar-grid">
      {giornate.map((g) => (
        <section key={g.data} className="calendar-grid-day">
          <h3 className="calendar-grid-title">{formattaData(g.data)}</h3>
          <div className="calendar-grid-scroll">
            <table className="calendar-grid-table">
              <thead>
                <tr>
                  <th className="calendar-grid-corner" scope="col"></th>
                  {g.campi.map((campo) => (
                    <th key={campo} className="calendar-grid-campo" scope="col">{etichettaCampo(campo)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.orari.map((orario) => (
                  <tr key={orario}>
                    <th className="calendar-grid-orario tnum" scope="row">{orario}</th>
                    {g.campi.map((campo) => {
                      const partite = partiteDi(g.celle, orario, campo)
                      const evidenziata = evidenza === chiaveCella(g.data, orario, campo)
                      const classiCella = ['calendar-grid-cell', partite.length > 1 ? 'calendar-grid-cell-collisione' : '', partite.length === 0 ? 'calendar-grid-cell-empty' : '', evidenziata ? 'calendar-grid-cell-evidenza' : ''].filter(Boolean).join(' ')
                      return (
                        <td key={campo} className={classiCella} data-data={g.data} data-orario={orario} data-campo={campo}>
                          {partite.length === 0 ? '—' : (
                            <>
                              {partite.length > 1 && (<span className="calendar-grid-avviso" title="Più partite sullo stesso campo e orario">⚠</span>)}
                              {partite.map((mm) => (
                                <MatchCardCalendario
                                  key={mm.id}
                                  match={mm}
                                  teamNames={teamNames}
                                  onPunteggio={onPunteggio}
                                  onSposta={onSposta}
                                  onSpostaSuCella={onSpostaSuCella}
                                  onEvidenzia={setEvidenza}
                                />
                              ))}
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
