import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament, teamsOf, matchesOf } from '../db/repositories'
import { prossimoPasso } from '../services/prossimoPasso'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'

const STATO_LABEL: Record<string, string> = {
  bozza: 'Bozza',
  iscrizioni_aperte: 'Iscrizioni aperte',
  in_corso: 'In corso',
  concluso: 'Concluso',
}

const AZIONE_LABEL: Record<string, string> = {
  squadre: 'Vai alle squadre',
  conferma: 'Conferma le squadre',
  genera: 'Genera il tabellone',
  calendario: 'Vai al calendario',
  punteggi: 'Inserisci i punteggi',
  nessuno: 'Vai',
}

export function RiepilogoScreen() {
  const { id } = useParams()
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])
  const teams = useLiveQuery(() => teamsOf(id ?? ''), [id], [])
  const matches = useLiveQuery(() => matchesOf(id ?? ''), [id], [])

  if (!id || !torneo) return null

  const confermate = teams.filter((sq) => sq.stato === 'confermata').length
  const inAttesa = teams.filter((sq) => sq.stato === 'in_attesa').length
  const passo = prossimoPasso(torneo, teams, matches)

  return (
    <section className="riepilogo">
      <header className="riepilogo-head">
        <h1>{torneo.nome}</h1>
        <div className="riepilogo-badges">
          <Badge>{torneo.tipologia}</Badge>
          <Badge>{torneo.formato.replace(/_/g, ' ')}</Badge>
          <Badge>{STATO_LABEL[torneo.stato] ?? torneo.stato}</Badge>
        </div>
        <p className="muted">
          Data: {torneo.data} · Codice iscrizione: <strong>{torneo.codiceIscrizione}</strong>
        </p>
      </header>

      <div className="riepilogo-stats">
        <div className="riepilogo-stat">
          <span className="riepilogo-stat-value">{confermate}</span>
          <span className="muted">Squadre confermate</span>
        </div>
        <div className="riepilogo-stat">
          <span className="riepilogo-stat-value">{inAttesa}</span>
          <span className="muted">Squadre in attesa</span>
        </div>
        <div className="riepilogo-stat">
          <span className="riepilogo-stat-value">{matches.length}</span>
          <span className="muted">Partite generate</span>
        </div>
      </div>

      <div className="riepilogo-cta">
        <div>
          <p className="riepilogo-cta-label">Prossimo passo</p>
          <p className="riepilogo-cta-testo">{passo.testo}</p>
        </div>
        <Link to={passo.rotta}>
          <Button>{AZIONE_LABEL[passo.azione] ?? 'Vai'}</Button>
        </Link>
      </div>
    </section>
  )
}
