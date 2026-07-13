import type { Match } from '../engine/types'
import { Button } from './Button'

interface Props {
  match: Match
  teamNames: Record<string, string>
  onModifica?: (match: Match) => void
}

function nomeSquadra(id: string | null, teamNames: Record<string, string>): string {
  if (!id) return 'Da definire'
  return teamNames[id] ?? id
}

export function MatchRow({ match, teamNames, onModifica }: Props) {
  const nomeA = nomeSquadra(match.teamAId, teamNames)
  const nomeB = nomeSquadra(match.teamBId, teamNames)
  const vinceA = !!match.vincitoreId && match.vincitoreId === match.teamAId
  const vinceB = !!match.vincitoreId && match.vincitoreId === match.teamBId

  return (
    <li className="match-row">
      <div className={`match-row-team${vinceA ? ' match-row-team-vincitore' : ''}`}>
        <span className="match-row-name">{nomeA}</span>
      </div>
      <div className="match-row-sets tnum">
        {match.set.length > 0 ? (
          match.set.map((s, i) => (
            <span key={i} className="match-row-set">
              {s.puntiA}–{s.puntiB}
            </span>
          ))
        ) : (
          <span className="match-row-set-placeholder">vs</span>
        )}
      </div>
      <div className={`match-row-team${vinceB ? ' match-row-team-vincitore' : ''}`}>
        <span className="match-row-name">{nomeB}</span>
      </div>
      {onModifica && (
        <Button type="button" variant="ghost" onClick={() => onModifica(match)}>
          {match.set.length > 0 ? 'Modifica' : 'Inserisci risultato'}
        </Button>
      )}
    </li>
  )
}
