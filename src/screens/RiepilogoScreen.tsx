import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { getTournament, teamsOf, matchesOf } from '../db/repositories'
import { prossimoPasso } from '../services/prossimoPasso'
import { getClient, getReadToken } from '../services/config'
import { nuoveIscrizioni, iscrizioneATeam } from '../services/import'
import { useToast } from '../components/Toast'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { SharePanel } from '../components/SharePanel'
import { useOrgSync } from '../services/useOrgSync'
import { notificaModificaOrg } from '../services/orgSync'
import { ConflittoOrgBanner } from '../components/ConflittoOrgBanner'
import type { Tipologia } from '../engine/types'

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
  const toast = useToast()
  const orgSync = useOrgSync(id)
  const [sincronizzando, setSincronizzando] = useState(false)
  const primoSync = useRef<string | null>(null)

  async function sincronizzaIscrizioni(
    codice: string,
    tournamentId: string,
    tipologia: Tipologia,
    annullato: () => boolean,
  ) {
    if (!getReadToken()) return
    setSincronizzando(true)
    try {
      const tutte = await getClient().elencaIscrizioni(codice)
      const esistenti = await teamsOf(tournamentId)
      const nuove = nuoveIscrizioni(tutte, esistenti, tipologia)
      if (nuove.length > 0) {
        await db.teams.bulkPut(nuove.map((i) => iscrizioneATeam(i, tournamentId)))
        notificaModificaOrg(tournamentId)
      }
      if (!annullato() && nuove.length > 0) toast(`${nuove.length} nuove iscrizioni`)
    } catch (err) {
      if (annullato()) return
      if (err instanceof Error && err.message === 'non autorizzato') {
        toast('Token non valido: controlla le impostazioni.', 'errore')
      }
      // altri errori: silenziati, non bloccare l'apertura del riepilogo
    } finally {
      // Reset sempre il flag di caricamento: uno setState dopo l'unmount è un
      // no-op sicuro in React 18. In StrictMode dev (mount→cleanup→remount) il
      // primo sync viene annullato, ma il flag deve comunque tornare a false
      // altrimenti il pulsante "Aggiorna iscrizioni" resta bloccato disabilitato.
      setSincronizzando(false)
    }
  }

  useEffect(() => {
    if (!id || !torneo || !torneo.codiceIscrizione) return
    if (primoSync.current === id) return
    primoSync.current = id
    let annullato = false
    void sincronizzaIscrizioni(torneo.codiceIscrizione, id, torneo.tipologia, () => annullato)
    return () => {
      annullato = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, torneo?.codiceIscrizione])

  if (!id || !torneo) return null

  const confermate = teams.filter((sq) => sq.stato === 'confermata').length
  const inAttesa = teams.filter((sq) => sq.stato === 'in_attesa').length
  const passo = prossimoPasso(torneo, teams, matches)

  async function confermaTutte() {
    await db.teams.where({ tournamentId: id, stato: 'in_attesa' }).modify({ stato: 'confermata' })
    if (id) notificaModificaOrg(id)
    toast('Squadre confermate')
  }

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

      <ConflittoOrgBanner sync={orgSync} />

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

      <SharePanel tournament={torneo} />

      <div className="registrations-actions">
        <Button
          variant="ghost"
          disabled={sincronizzando || !getReadToken()}
          onClick={() => {
            if (torneo.codiceIscrizione) void sincronizzaIscrizioni(torneo.codiceIscrizione, id, torneo.tipologia, () => false)
          }}
        >
          Aggiorna iscrizioni
        </Button>
        {inAttesa > 0 && (
          <Button variant="ghost" onClick={confermaTutte}>
            Conferma tutte
          </Button>
        )}
      </div>
    </section>
  )
}
