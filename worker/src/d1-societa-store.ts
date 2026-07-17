import type { SocietaStore, SocietaRecord } from './handler'
import type { D1Like } from './d1-org-store'

const cols = 'id, nome, creato_il'

export function d1SocietaStore(db: D1Like): SocietaStore {
  return {
    async elenco() {
      const r = await db.prepare(`SELECT ${cols} FROM societa ORDER BY creato_il DESC`).all<SocietaRecord>()
      return r.results ?? []
    },
    async crea(s) {
      await db.prepare('INSERT INTO societa (id,nome,creato_il) VALUES (?,?,?)').bind(s.id, s.nome, s.creato_il).run()
    },
    async perId(id) {
      return (await db.prepare(`SELECT ${cols} FROM societa WHERE id = ?`).bind(id).first<SocietaRecord>()) ?? null
    },
  }
}
