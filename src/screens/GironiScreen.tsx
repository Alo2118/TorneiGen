import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTournament, teamsOf, groupsOf, matchesOf, replaceGenerated } from '../db/repositories'
import { mappaEtichette } from '../services/teams'
import { spostaSquadra, aggiungiGirone, rimuoviGirone } from '../services/gironiEdit'
import { notificaModificaOrg } from '../services/orgSync'
import { usePointerDrag } from '../services/usePointerDrag'
import { Button } from '../components/Button'

function SquadraChip({
  teamId,
  nome,
  onSposta,
}: {
  teamId: string
  nome: string
  onSposta: (teamId: string, toGroupId: string) => void
}) {
  const { trascinando, handlers } = usePointerDrag({
    onRilascia: (x, y) => {
      const el = document.elementFromPoint(x, y)
      const col = el?.closest('[data-girone]') as HTMLElement | null
      if (col?.dataset.girone) onSposta(teamId, col.dataset.girone)
    },
  })
  return (
    <div
      className={`girone-chip${trascinando ? ' girone-chip-trascina' : ''}`}
      style={{ touchAction: 'none' }}
      {...handlers}
    >
      {nome}
    </div>
  )
}

export function GironiScreen() {
  const { id } = useParams()
  const torneo = useLiveQuery(() => (id ? getTournament(id) : undefined), [id])
  const teams = useLiveQuery(() => teamsOf(id ?? ''), [id], [])
  const groups = useLiveQuery(() => groupsOf(id ?? ''), [id], [])
  const matches = useLiveQuery(() => matchesOf(id ?? ''), [id], [])

  if (!id || !torneo) return null

  const usaGironi = torneo.formato === 'gironi_eliminazione' || torneo.formato === 'girone_italiana'
  const teamNames = mappaEtichette(teams, torneo.tipologia)

  async function applica(next: { groups: typeof groups; matches: typeof matches }) {
    await replaceGenerated(id!, next.groups, next.matches)
    notificaModificaOrg(id!)
  }

  const onSposta = (teamId: string, toGroupId: string) =>
    void applica(spostaSquadra(torneo!, groups, matches, teamId, toGroupId))
  const onAggiungi = () => void applica({ groups: aggiungiGirone(torneo!, groups), matches })
  const onRimuovi = (groupId: string) => void applica(rimuoviGirone(groups, matches, groupId))

  return (
    <section className="gironi-edit">
      <header className="standings-head">
        <h1>Gironi</h1>
      </header>

      {!usaGironi ? (
        <p className="empty">Questo formato non usa i gironi.</p>
      ) : groups.length === 0 ? (
        <p className="empty">Nessun girone ancora. Genera il torneo dal Riepilogo, poi modifica qui la composizione.</p>
      ) : (
        <>
          <p className="muted">
            Trascina una squadra da un girone all'altro. Le partite dei gironi modificati vengono
            rigenerate (i loro punteggi si azzerano).
          </p>
          <div className="gironi-grid">
            {groups.map((g) => (
              <div key={g.id} className="girone-col" data-girone={g.id}>
                <div className="girone-col-head">
                  <h2>{g.nome}</h2>
                  {g.teamIds.length === 0 && (
                    <Button variant="ghost" onClick={() => onRimuovi(g.id)}>
                      Rimuovi
                    </Button>
                  )}
                </div>
                {g.teamIds.length === 0 ? (
                  <p className="muted">Trascina qui una squadra</p>
                ) : (
                  g.teamIds.map((tid) => (
                    <SquadraChip key={tid} teamId={tid} nome={teamNames[tid] ?? tid} onSposta={onSposta} />
                  ))
                )}
              </div>
            ))}
          </div>
          <div className="registrations-actions">
            <Button variant="ghost" onClick={onAggiungi}>
              Aggiungi girone
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
