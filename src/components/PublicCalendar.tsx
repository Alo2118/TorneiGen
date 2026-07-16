import type { Match } from '../engine/types'
import { CalendarGrid } from './CalendarGrid'

interface Props {
  matches: Match[]
  teamNames: Record<string, string>
}

export function PublicCalendar({ matches, teamNames }: Props) {
  const haProgrammate = matches.some((m) => m.orario)
  if (!haProgrammate) return null
  return (
    <section className="public-calendar">
      <h2>Calendario</h2>
      <CalendarGrid matches={matches} teamNames={teamNames} />
    </section>
  )
}
