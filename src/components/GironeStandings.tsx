import { classificaGirone } from '../services/standings'
import type { Group, Match, RegolePunteggio, StandingRow } from '../engine/types'

interface Props {
  group: Group
  matches: Match[]
  regole: RegolePunteggio
  teamNames: Record<string, string>
  qualificati: number | 'tutti'
}

function quoziente(fatti: number, subiti: number): string {
  if (subiti === 0) return fatti === 0 ? '—' : '∞'
  return (fatti / subiti).toFixed(2)
}

export function GironeStandings({ group, matches, regole, teamNames, qualificati }: Props) {
  const righe = classificaGirone(group, matches, regole)
  const soglia = qualificati === 'tutti' ? righe.length : qualificati

  return (
    <section className="standings-group">
      <h2>{group.nome}</h2>
      <div className="standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th className="tnum">#</th>
              <th>Squadra</th>
              <th className="tnum">G</th>
              <th className="tnum">V–P</th>
              <th className="tnum">Quoz. set</th>
              <th className="tnum">Quoz. punti</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r: StandingRow, i: number) => {
              const qualificata = i < soglia
              const tagli = i === soglia - 1 && qualificati !== 'tutti' && soglia < righe.length
              return (
                <tr
                  key={r.teamId}
                  className={`${qualificata ? 'standings-row-qualificata' : ''}${tagli ? ' standings-row-taglio' : ''}`.trim() || undefined}
                >
                  <td className="tnum">{i + 1}</td>
                  <td>{teamNames[r.teamId] ?? r.teamId}</td>
                  <td className="tnum">{r.giocate}</td>
                  <td className="tnum">{r.vinte}–{r.perse}</td>
                  <td className="tnum">{quoziente(r.setVinti, r.setPersi)}</td>
                  <td className="tnum">{quoziente(r.puntiFatti, r.puntiSubiti)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
