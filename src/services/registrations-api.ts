import type { Riepilogo, Iscrizione, GiocatoreIscrizione } from '../types/registrations'
import type { PublicSnapshot } from '../types/public'
import type { OrgRecord } from '../types/org'

export interface UtenteSessione {
  email: string
  ruolo: 'utente' | 'admin'
  societaId: string | null
}

export interface EsitoRegistrazione {
  stato?: 'in_attesa'
  token?: string
  utente?: UtenteSessione
}

export interface EsitoAccesso {
  token: string
  utente: UtenteSessione
}

export interface UtenteAmministrato {
  id: string
  email: string
  ruolo: 'utente' | 'admin'
  abilitato: 0 | 1
  societaId: string | null
  societaRichiesta: string | null
}

export interface Societa {
  id: string
  nome: string
  creato_il: string
}

export interface RegistrationsClient {
  getRiepilogo(codice: string): Promise<Riepilogo>
  pubblicaRiepilogo(r: Riepilogo): Promise<Riepilogo>
  inviaIscrizione(codice: string, dati: { nomeSquadra: string; giocatori: GiocatoreIscrizione[] }): Promise<{ id: string }>
  elencaIscrizioni(codice: string): Promise<Iscrizione[]>
  eliminaIscrizione(codice: string, id: string): Promise<void>
  pubblicaSnapshot(snap: PublicSnapshot): Promise<void>
  getSnapshot(codice: string): Promise<PublicSnapshot>
  rimuoviSnapshot(codice: string): Promise<void>
  getOrg(codice: string): Promise<OrgRecord | null>
  putOrg(codice: string, doc: string, version: number): Promise<{ conflitto: boolean; version: number }>
  deleteOrg(codice: string): Promise<void>
  registrazione(email: string, password: string, societa?: string): Promise<EsitoRegistrazione>
  accesso(email: string, password: string): Promise<EsitoAccesso>
  io(): Promise<UtenteSessione>
  elencoUtenti(): Promise<UtenteAmministrato[]>
  elencoSocieta(): Promise<Societa[]>
  creaSocieta(nome: string): Promise<Societa>
  abilitaUtente(id: string, societaId: string): Promise<void>
}

export function creaClient(config: { baseUrl: string; token?: string; sessione?: string }): RegistrationsClient {
  const base = config.baseUrl.replace(/\/+$/, '')
  const headerW = (): Record<string, string> => (config.sessione ? { authorization: `Bearer ${config.sessione}` } : {})

  async function call(method: string, path: string, opts: { body?: unknown; auth?: boolean; sessione?: boolean } = {}): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    if (opts.auth && config.token) headers.authorization = `Bearer ${config.token}`
    if (opts.sessione) Object.assign(headers, headerW())
    const res = await fetch(base + path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (data as { error?: string }).error ?? `Errore ${res.status}`
      throw new Error(msg)
    }
    return data
  }

  return {
    getRiepilogo: (codice) => call('GET', `/api/torneo/${codice}`) as Promise<Riepilogo>,
    pubblicaRiepilogo: (r) => call('POST', '/api/torneo', { body: r, auth: true }) as Promise<Riepilogo>,
    inviaIscrizione: (codice, dati) => call('POST', `/api/iscrizioni/${codice}`, { body: dati }) as Promise<{ id: string }>,
    async elencaIscrizioni(codice) {
      const d = (await call('GET', `/api/iscrizioni/${codice}`, { auth: true })) as { iscrizioni: Iscrizione[] }
      return d.iscrizioni
    },
    async eliminaIscrizione(codice, id) {
      await call('DELETE', `/api/iscrizioni/${codice}/${id}`, { auth: true })
    },
    async pubblicaSnapshot(snap) {
      await call('POST', `/api/pubblico/${snap.codice}`, { body: snap, auth: true })
    },
    getSnapshot: (codice) => call('GET', `/api/pubblico/${codice}`) as Promise<PublicSnapshot>,
    async rimuoviSnapshot(codice) {
      await call('DELETE', `/api/pubblico/${codice}`, { auth: true })
    },
    async getOrg(codice) {
      const res = await fetch(`${base}/api/org/${codice}`, { headers: headerW() })
      if (res.status === 404) return null
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Errore ${res.status}`)
      return data as OrgRecord
    },
    async putOrg(codice, doc, version) {
      const res = await fetch(`${base}/api/org/${codice}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...headerW() },
        body: JSON.stringify({ doc, version }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; version?: number }
      if (res.status === 409) return { conflitto: true, version: data.version ?? version }
      if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`)
      return { conflitto: false, version: data.version ?? version }
    },
    registrazione: (email, password, societa) =>
      call('POST', '/api/auth/registrazione', { body: { email, password, societa } }) as Promise<EsitoRegistrazione>,
    accesso: (email, password) => call('POST', '/api/auth/accesso', { body: { email, password } }) as Promise<EsitoAccesso>,
    io: () => call('GET', '/api/auth/io', { sessione: true }) as Promise<UtenteSessione>,
    async elencoUtenti() {
      const d = (await call('GET', '/api/admin/utenti', { sessione: true })) as { utenti: UtenteAmministrato[] }
      return d.utenti
    },
    async elencoSocieta() {
      const d = (await call('GET', '/api/admin/societa', { sessione: true })) as { societa: Societa[] }
      return d.societa
    },
    creaSocieta: (nome) => call('POST', '/api/admin/societa', { body: { nome }, sessione: true }) as Promise<Societa>,
    async abilitaUtente(id, societaId) {
      await call('POST', `/api/admin/utenti/${id}/abilita`, { body: { societaId }, sessione: true })
    },
    async deleteOrg(codice) {
      const res = await fetch(`${base}/api/org/${codice}`, { method: 'DELETE', headers: headerW() })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Errore ${res.status}`)
      }
    },
  }
}
