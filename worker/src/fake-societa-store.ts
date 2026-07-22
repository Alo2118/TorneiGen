import type { SocietaStore, SocietaRecord } from './handler'

export function fakeSocietaStore(seed?: SocietaRecord[]): SocietaStore {
  const m = new Map<string, SocietaRecord>((seed ?? []).map((r) => [r.id, { ...r }]))
  return {
    async elenco() {
      // Ordine per creato_il DESC come il d1SocietaStore (ORDER BY creato_il DESC).
      return [...m.values()]
        .map((r) => ({ ...r }))
        .sort((a, b) => b.creato_il.localeCompare(a.creato_il))
    },
    async crea(s) {
      m.set(s.id, { ...s })
    },
    async perId(id) {
      const r = m.get(id)
      return r ? { ...r } : null
    },
  }
}
