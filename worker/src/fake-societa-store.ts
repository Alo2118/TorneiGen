import type { SocietaStore, SocietaRecord } from './handler'

export function fakeSocietaStore(seed?: SocietaRecord[]): SocietaStore {
  const m = new Map<string, SocietaRecord>((seed ?? []).map((r) => [r.id, { ...r }]))
  return {
    async elenco() {
      return [...m.values()].map((r) => ({ ...r }))
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
