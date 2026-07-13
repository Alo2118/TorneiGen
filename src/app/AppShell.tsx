import { NavLink, Outlet, useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament } from '../db/repositories'
import { exportBackup } from '../db/backup'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'

const SEZIONI = [
  { to: 'riepilogo', label: 'Riepilogo', icon: '⌂' },
  { to: 'squadre', label: 'Squadre', icon: '▤' },
  { to: 'tabellone', label: 'Tabellone', icon: '☷' },
  { to: 'classifiche', label: 'Classifiche', icon: '≡' },
]

const STATO_LABEL: Record<string, string> = {
  bozza: 'Bozza',
  iscrizioni_aperte: 'Iscrizioni aperte',
  in_corso: 'In corso',
  concluso: 'Concluso',
}

export function AppShell() {
  const { id } = useParams()
  const navigate = useNavigate()
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])

  async function handleExport() {
    if (!torneo) return
    const data = await exportBackup(torneo.id)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `torneo-${torneo.nome}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="shell">
      <nav className="nav-rail" aria-label="Navigazione">
        <NavLink to="/" end className="nav-brand">
          Tornei
        </NavLink>
        {torneo && (
          <ul className="nav-links">
            {SEZIONI.map((s) => (
              <li key={s.to}>
                <NavLink to={`/tornei/${torneo.id}/${s.to}`} className="nav-link">
                  <span className="nav-icon" aria-hidden="true">{s.icon}</span>
                  <span className="nav-label">{s.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="shell-main">
        {torneo && (
          <header className="tourn-header">
            <div className="tourn-header-info">
              <h2 className="display">{torneo.nome}</h2>
              <div className="tourn-header-badges">
                <Badge>{torneo.tipologia}</Badge>
                <Badge>{torneo.formato.replace(/_/g, ' ')}</Badge>
                <Badge>{STATO_LABEL[torneo.stato] ?? torneo.stato}</Badge>
              </div>
            </div>
            <div className="tourn-header-actions">
              <Button variant="ghost" onClick={() => navigate(`/tornei/${torneo.id}/tabellone`)}>
                Genera
              </Button>
              <Button variant="ghost" onClick={handleExport}>Export JSON</Button>
            </div>
          </header>
        )}

        <main className="shell-content">
          <Outlet />
        </main>
      </div>

      {torneo && (
        <nav className="bottom-bar" aria-label="Navigazione">
          {SEZIONI.map((s) => (
            <NavLink key={s.to} to={`/tornei/${torneo.id}/${s.to}`} className="bottom-bar-link">
              <span className="nav-icon" aria-hidden="true">{s.icon}</span>
              <span className="nav-label">{s.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
