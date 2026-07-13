import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listTournaments } from '../db/repositories'
import { Button } from '../components/Button'

export function HomeScreen() {
  const tornei = useLiveQuery(listTournaments, [], [])

  return (
    <section className="home">
      <header className="home-head">
        <h1>Tornei</h1>
        <Link to="/tornei/nuovo"><Button>Nuovo torneo</Button></Link>
      </header>
      {tornei.length === 0 ? (
        <p className="empty">Nessun torneo ancora. Creane uno per iniziare.</p>
      ) : (
        <ul className="card-grid">
          {tornei.map((t) => (
            <li key={t.id} className="card">
              <Link to={`/tornei/${t.id}/squadre`} className="card-link">
                <h3>{t.nome}</h3>
                <p className="muted">{t.tipologia} · {t.formato.replace('_', ' ')} · {t.data}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
