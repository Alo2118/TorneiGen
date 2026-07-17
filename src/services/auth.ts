import { getClient, setSessione, clearSessione } from './config'

export interface Utente {
  email: string
  ruolo: 'utente' | 'admin'
  societaId: string | null
}

export async function registra(email: string, password: string, societa: string): Promise<{ inAttesa: boolean }> {
  const r = await getClient().registrazione(email, password, societa)
  if (r.token) {
    setSessione(r.token)
    return { inAttesa: false }
  }
  return { inAttesa: true }
}

export async function accedi(email: string, password: string): Promise<Utente> {
  const r = await getClient().accesso(email, password)
  setSessione(r.token)
  return r.utente
}

export function esci(): void {
  clearSessione()
}

export async function utenteCorrente(): Promise<Utente | null> {
  try {
    return await getClient().io()
  } catch {
    return null
  }
}
