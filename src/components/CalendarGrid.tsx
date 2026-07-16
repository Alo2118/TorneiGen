import type { Match } from '../engine/types'
import { buildCalendarGrid, CAMPO_VUOTO } from '../engine/calendarGrid'
import type { CellaGriglia } from '../engine/calendarGrid'

interface Props {
  matches: Match[]
  teamNames: Record<string, string>
  onSeleziona?: (match: Match) => void
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

export function CalendarGrid({ matches, teamNames, onSeleziona }: Props) {
  const giornate = buildCalendarGrid(matches)
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
                      if (partite.length === 0) {
                        return <td key={campo} className="calendar-grid-cell calendar-grid-cell-empty">—</td>
                      }
                      return (
                        <td key={campo} className={`calendar-grid-cell${partite.length > 1 ? ' calendar-grid-cell-collisione' : ''}`}>
                          {partite.length > 1 && (
                            <span className="calendar-grid-avviso" title="Più partite sullo stesso campo e orario">⚠</span>
                          )}
                          {partite.map((mm) => {
                            const testo = `${nome(mm.teamAId, teamNames)} — ${nome(mm.teamBId, teamNames)}`
                            return onSeleziona ? (
                              <button key={mm.id} type="button" className="calendar-grid-match" onClick={() => onSeleziona(mm)}>
                                {testo}
                              </button>
                            ) : (
                              <span key={mm.id} className="calendar-grid-match">{testo}</span>
                            )
                          })}
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
