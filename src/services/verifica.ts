import { getApiBaseUrl, getReadToken } from './config'

export async function verificaConnessione(): Promise<{ ok: boolean; messaggio: string }> {
  const base = getApiBaseUrl().replace(/\/+$/, '')
  const token = getReadToken()
  // 1) URL raggiungibile?
  try {
    await fetch(`${base}/api/torneo/__verifica__`)
  } catch {
    return { ok: false, messaggio: 'URL API non raggiungibile: controlla le Impostazioni.' }
  }
  // 2) token valido?
  if (!token) return { ok: false, messaggio: 'Token mancante: impostalo nelle Impostazioni.' }
  try {
    const res = await fetch(`${base}/api/iscrizioni/__verifica__`, { headers: { authorization: `Bearer ${token}` } })
    if (res.status === 401) return { ok: false, messaggio: 'Token non valido: controlla le Impostazioni.' }
  } catch {
    return { ok: false, messaggio: 'URL API non raggiungibile: controlla le Impostazioni.' }
  }
  return { ok: true, messaggio: 'Connesso: URL e token corretti.' }
}
