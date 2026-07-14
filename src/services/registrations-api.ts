import type { Riepilogo, Iscrizione, GiocatoreIscrizione } from '../types/registrations'

export interface RegistrationsClient {
  getRiepilogo(codice: string): Promise<Riepilogo>
  pubblicaRiepilogo(r: Riepilogo): Promise<Riepilogo>
  inviaIscrizione(codice: string, dati: { nomeSquadra: string; giocatori: GiocatoreIscrizione[] }): Promise<{ id: string }>
  elencaIscrizioni(codice: string): Promise<Iscrizione[]>
  eliminaIscrizione(codice: string, id: string): Promise<void>
}

export function creaClient(config: { baseUrl: string; token?: string }): RegistrationsClient {
  const base = config.baseUrl.replace(/\/+$/, '')

  async function call(method: string, path: string, opts: { body?: unknown; auth?: boolean } = {}): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    if (opts.auth && config.token) headers.authorization = `Bearer ${config.token}`
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
  }
}
