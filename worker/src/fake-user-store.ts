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
      m.set(u.id, { ...u, email: norm(u.email) })
    },
    async abilita(id, societaId, abilitato) {
      const r = m.get(id)
      if (r) m.set(id, { ...r, societa_id: societaId, abilitato: abilitato ? 1 : 0 })
    },
    async elenco() {
      return [...m.values()].map((r) => ({ ...r }))
    },
  }
}
