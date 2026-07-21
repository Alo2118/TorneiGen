import type { UserStore, UtenteRecord } from './handler'
import type { D1Like } from './d1-org-store'

const cols =
  'id, email, password_hash, salt, iterazioni, ruolo, abilitato, societa_id AS societa_id, societa_richiesta AS societa_richiesta, creato_il'

export function d1UserStore(db: D1Like): UserStore {
  return {
    async perEmail(email) {
      return (
        (await db
          .prepare(`SELECT ${cols} FROM utenti WHERE email = ?`)
          .bind(email.trim().toLowerCase())
          .first<UtenteRecord>()) ?? null
      )
    },
    async perId(id) {
      return (await db.prepare(`SELECT ${cols} FROM utenti WHERE id = ?`).bind(id).first<UtenteRecord>()) ?? null
    },
    async crea(u) {
      await db
        .prepare(
          'INSERT INTO utenti (id,email,password_hash,salt,iterazioni,ruolo,abilitato,societa_id,societa_richiesta,creato_il) VALUES (?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          u.id,
          u.email.trim().toLowerCase(),
          u.password_hash,
          u.salt,
          u.iterazioni,
          u.ruolo,
          u.abilitato,
          u.societa_id,
          u.societa_richiesta,
          u.creato_il,
        )
        .run()
    },
    async abilita(id, societaId, abilitato) {
      await db.prepare('UPDATE utenti SET abilitato = ?, societa_id = ? WHERE id = ?').bind(abilitato ? 1 : 0, societaId, id).run()
    },
    async elimina(id) {
      await db.prepare('DELETE FROM utenti WHERE id = ?').bind(id).run()
    },
    async elenco() {
      const r = await db.prepare(`SELECT ${cols} FROM utenti ORDER BY creato_il DESC`).all<UtenteRecord>()
      return r.results ?? []
    },
  }
}
