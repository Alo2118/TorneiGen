import { getApiBaseUrl, getSessione } from './config'

export async function verificaConnessione(): Promise<{ ok: boolean; messaggio: string }> {
  const base = getApiBaseUrl().replace(/\/+$/, '')
  const sessione = getSessione()
  // 1) URL raggiungibile?
  try {
    await fetch(`${base}/api/torneo/__verifica__`)
  } catch {
    return { ok: false, messaggio: 'URL API non raggiungibile: controlla le Impostazioni.' }
  }
  // 2) sessione presente e valida?
  if (!sessione) return { ok: false, messaggio: 'Non hai effettuato l\'accesso: accedi per pubblicare.' }
  try {
    const res = await fetch(`${base}/api/iscrizioni/__verifica__`, { headers: { authorization: `Bearer ${sessione}` } })
    if (res.status === 401) return { ok: false, messaggio: 'Sessione non valida o scaduta: accedi di nuovo.' }
  } catch {
    return { ok: false, messaggio: 'URL API non raggiungibile: controlla le Impostazioni.' }
  }
  return { ok: true, messaggio: 'Connesso: sei autenticato.' }
}
