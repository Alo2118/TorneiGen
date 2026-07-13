import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament, teamsOf, groupsOf, matchesOf } from '../db/repositories'
import { classificaGirone } from '../services/standings'
import type { StandingRow } from '../engine/types'

function quozienteDisplay(fatti: number, subiti: number): string {
  if (subiti === 0) return fatti === 0 ? '—' : '∞'
  return (fatti / subiti).toFixed(2)
}

function nomeSquadra(id: string | null, teamNames: Record<string, string>): string {
  if (!id) return 'Da definire'
  return teamNames[id] ?? id
}

export function StandingsScreen() {
  const { id } = useParams()
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])
  const teams = useLiveQuery(() => teamsOf(id ?? ''), [id], [])
  const groups = useLiveQuery(() => groupsOf(id ?? ''), [id], [])
  const matches = useLiveQuery(() => matchesOf(id ?? ''), [id], [])

  if (!id || !torneo) return null

  const teamNames: Record<string, string> = Object.fromEntries(teams.map((t) => [t.id, t.nome]))
  const matchTabellone = matches.filter((m) => m.fase === 'tabellone')
  const rounds = [...new Set(matchTabellone.map((m) => m.round))].sort((a, b) => a - b)
  const ultimoRound = rounds.length ? rounds[rounds.length - 1] : null
  const finale = ultimoRound !== null ? matchTabellone.find((m) => m.round === ultimoRound) : undefined
  const campioneId = finale && finale.stato === 'conclusa' ? finale.vincitoreId : undefined

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
          {groups.map((g) => {
            const righe = classificaGirone(g, matches, torneo.regolePunteggio)
            return (
              <section key={g.id} className="standings-group">
                <h2>{g.nome}</h2>
                <div className="standings-table-wrap">
                  <table className="standings-table">
                    <thead>
                      <tr>
                        <th>Squadra</th>
                        <th className="tnum">G</th>
                        <th className="tnum">V</th>
                        <th className="tnum">Quoz. set</th>
                        <th className="tnum">Quoz. punti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {righe.map((r: StandingRow, i: number) => (
                        <tr key={r.teamId} className={i === 0 ? 'standings-row-lead' : undefined}>
                          <td>{nomeSquadra(r.teamId, teamNames)}</td>
                          <td className="tnum">{r.giocate}</td>
                          <td className="tnum">{r.vinte}</td>
                          <td className="tnum">{quozienteDisplay(r.setVinti, r.setPersi)}</td>
                          <td className="tnum">{quozienteDisplay(r.puntiFatti, r.puntiSubiti)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {matchTabellone.length > 0 && (
        <section className="standings-bracket">
          <h2>Avanzamento tabellone</h2>
          {campioneId && (
            <p className="standings-champion">
              Campione: <strong>{nomeSquadra(campioneId, teamNames)}</strong>
            </p>
          )}
          <div className="standings-rounds">
            {rounds.map((round) => (
              <div key={round} className="standings-round">
                <h3>Turno {round}</h3>
                <ul className="standings-round-list">
                  {matchTabellone
                    .filter((m) => m.round === round)
                    .map((m) => {
                      const vinceA = !!m.vincitoreId && m.vincitoreId === m.teamAId
                      const vinceB = !!m.vincitoreId && m.vincitoreId === m.teamBId
                      return (
                        <li key={m.id} className="standings-bracket-match">
                          <span className={vinceA ? 'standings-advanced' : undefined}>
                            {nomeSquadra(m.teamAId, teamNames)}
                          </span>
                          <span className="muted">vs</span>
                          <span className={vinceB ? 'standings-advanced' : undefined}>
                            {nomeSquadra(m.teamBId, teamNames)}
                          </span>
                        </li>
                      )
                    })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
