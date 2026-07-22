import type { UserStore, UtenteRecord } from './handler'

export function fakeUserStore(seed?: UtenteRecord[]): UserStore {
  const m = new Map<string, UtenteRecord>((seed ?? []).map((r) => [r.id, { ...r }]))
  const norm = (e: string) => e.trim().toLowerCase()
  return {
    async perEmail(email) {
      for (const r of m.values()) if (norm(r.email) === norm(email)) return { ...r }
      return null
    },
    async perId(id) {
      const r = m.get(id)
      return r ? { ...r } : null
    },
    async crea(u) {
      // Parità col vincolo UNIQUE(email) di D1: due utenti con la stessa email
      // non possono coesistere (in prod la seconda INSERT lancerebbe).
      const email = norm(u.email)
      for (const r of m.values()) if (norm(r.email) === email) throw new Error('email già registrata')
      m.set(u.id, { ...u, email })
    },
    async abilita(id, societaId, abilitato) {
      const r = m.get(id)
      if (r) m.set(id, { ...r, societa_id: societaId, abilitato: abilitato ? 1 : 0 })
    },
    async elimina(id) {
      m.delete(id)
    },
    async elenco() {
      // Ordine per creato_il DESC come il d1UserStore (ORDER BY creato_il DESC).
      return [...m.values()]
        .map((r) => ({ ...r }))
        .sort((a, b) => b.creato_il.localeCompare(a.creato_il))
    },
  }
}
