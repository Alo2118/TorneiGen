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
    async putSeVersione(row, base) {
      const corrente = m.get(row.codice)
      // base 0 => il documento non deve ancora esistere; base>0 => la versione deve combaciare
      if (base === 0 ? corrente !== undefined : corrente?.version !== base) return false
      m.set(row.codice, { ...row })
      return true
    },
    async delete(codice) {
      m.delete(codice)
    },
    async elenco(societaId) {
      const tutti = [...m.values()]
      return societaId == null ? tutti : tutti.filter((r) => r.societaId === societaId)
    },
    async assegnaSocieta(codice, societaId) {
      const r = m.get(codice)
      if (r) m.set(codice, { ...r, societaId })
    },
  }
}
