import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament, teamsOf, groupsOf, matchesOf } from '../db/repositories'
import { GironeStandings } from '../components/GironeStandings'
import { BracketTree } from '../components/BracketTree'

export function StandingsScreen() {
  const { id } = useParams()
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])
  const teams = useLiveQuery(() => teamsOf(id ?? ''), [id], [])
  const groups = useLiveQuery(() => groupsOf(id ?? ''), [id], [])
  const matches = useLiveQuery(() => matchesOf(id ?? ''), [id], [])

  if (!id || !torneo) return null

  const teamNames: Record<string, string> = Object.fromEntries(teams.map((t) => [t.id, t.nome]))
  const matchTabellone = matches.filter((m) => m.fase === 'tabellone')

  return (
    <section className="standings">
      <header className="standings-head">
        <h1>Classifiche</h1>
      </header>

      {groups.length === 0 && matchTabellone.length === 0 && (
        <p className="empty">Nessun girone o tabellone generato ancora.</p>
      )}

      {groups.length > 0 && (
        <div className="standings-groups">
          {groups.map((g) => (
            <GironeStandings
              key={g.id}
              group={g}
              matches={matches}
              regole={torneo.regolePunteggio}
              teamNames={teamNames}
              qualificati={torneo.qualificatiPerGirone ?? 'tutti'}
            />
          ))}
        </div>
      )}

      {matchTabellone.length > 0 && (
        <section className="standings-bracket">
          <h2>Tabellone</h2>
          <BracketTree matches={matchTabellone} teamNames={teamNames} variant="statico" />
        </section>
      )}
    </section>
  )
}
