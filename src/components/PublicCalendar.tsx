import type { Match } from '../engine/types'

interface Props {
  matches: Match[]
  teamNames: Record<string, string>
}

function nome(id: string | null, names: Record<string, string>): string {
  return id ? names[id] ?? id : 'Da definire'
}

export function PublicCalendar({ matches, teamNames }: Props) {
  const programmate = matches
    .filter((m) => m.orario)
    .sort((a, b) => (a.orario! < b.orario! ? -1 : a.orario! > b.orario! ? 1 : 0))
  if (programmate.length === 0) return null

  const perData = new Map<string, Match[]>()
  for (const m of programmate) {
    const data = m.orario!.slice(0, 10)
    const lista = perData.get(data) ?? []
    lista.push(m)
    perData.set(data, lista)
  }

  return (
    <section className="public-calendar">
      <h2>Calendario</h2>
      {[...perData.entries()].map(([data, ms]) => (
        <div key={data} className="public-calendar-day">
          <h3>{data}</h3>
          <ul className="public-calendar-list">
            {ms.map((m) => (
              <li key={m.id} className="public-calendar-row">
                <span className="public-calendar-time tnum">{m.orario!.slice(11, 16)}</span>
                {m.campo && <span className="public-calendar-court">Campo {m.campo}</span>}
                <span className="public-calendar-teams">
                  {nome(m.teamAId, teamNames)} — {nome(m.teamBId, teamNames)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
