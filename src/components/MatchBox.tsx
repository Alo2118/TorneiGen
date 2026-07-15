import type { Match } from '../engine/types'

interface Props {
  match: Match
  teamNames: Record<string, string>
  campione?: boolean
  onClick?: (match: Match) => void
}

function nome(id: string | null, names: Record<string, string>): string {
  return id ? names[id] ?? id : 'Da definire'
}

export function MatchBox({ match, teamNames, campione, onClick }: Props) {
  const nomeA = nome(match.teamAId, teamNames)
  const nomeB = nome(match.teamBId, teamNames)
  const vinceA = !!match.vincitoreId && match.vincitoreId === match.teamAId
  const vinceB = !!match.vincitoreId && match.vincitoreId === match.teamBId
  const cliccabile = !!onClick && !!match.teamAId && !!match.teamBId
  const setsA = match.set.map((s) => s.puntiA).join(' ')
  const setsB = match.set.map((s) => s.puntiB).join(' ')
  const label =
    `${nomeA} ${setsA}, ${nomeB} ${setsB}` +
    (match.vincitoreId ? `, vince ${vinceA ? nomeA : nomeB}` : '')

  const contenuto = (
    <>
      <div className={`match-box-row${vinceA ? ' match-box-row-vince' : ''}`}>
        <span className="match-box-name">{campione && vinceA ? '🏆 ' : ''}{nomeA}</span>
        <span className="match-box-score tnum">{setsA}</span>
      </div>
      <div className={`match-box-row${vinceB ? ' match-box-row-vince' : ''}`}>
        <span className="match-box-name">{campione && vinceB ? '🏆 ' : ''}{nomeB}</span>
        <span className="match-box-score tnum">{setsB}</span>
      </div>
    </>
  )

  if (cliccabile) {
    return (
      <button type="button" className="match-box" aria-label={label} onClick={() => onClick!(match)}>
        {contenuto}
      </button>
    )
  }
  return (
    <div className={`match-box${campione ? ' match-box-campione' : ''}`} role="group" aria-label={label}>
      {contenuto}
    </div>
  )
}
