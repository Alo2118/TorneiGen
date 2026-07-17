import type { OrgStore } from './handler'
import type { OrgRecord } from '../../src/types/org'

export function fakeOrgStore(seed?: OrgRecord[]): OrgStore {
  const m = new Map<string, OrgRecord>((seed ?? []).map((r) => [r.codice, r]))
  return {
    async get(codice) {
      return m.get(codice) ?? null
    },
    async put(row) {
      m.set(row.codice, { ...row })
    },
    async delete(codice) {
      m.delete(codice)
    },
  }
}
