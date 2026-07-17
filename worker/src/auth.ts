export interface SessioneUtente {
  sub: string
  email: string
  ruolo: 'utente' | 'admin'
  societaId: string | null
  exp: number
}

const ITERAZIONI = 150000
const enc = new TextEncoder()

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
function deb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function b64url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlStr(s: string): string {
  return b64url(enc.encode(s))
}
function deb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return deb64(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
}
function confrontoCostante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function derivaBits(password: string, salt: Uint8Array<ArrayBuffer>, iterazioni: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iterazioni, hash: 'SHA-256' }, key, 256)
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string; iterazioni: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await derivaBits(password, salt, ITERAZIONI)
  return { hash: b64(derived), salt: b64(salt), iterazioni: ITERAZIONI }
}

export async function verificaPassword(password: string, hash: string, salt: string, iterazioni: number): Promise<boolean> {
  const derived = await derivaBits(password, deb64(salt), iterazioni)
  return confrontoCostante(derived, deb64(hash))
}

// Salt e hash fittizi (16 byte / 32 byte, nessun segreto reale) usati solo per equalizzare
// il tempo di calcolo sul percorso "email sconosciuta" durante il login: senza questo, la
// mancata esecuzione di PBKDF2 renderebbe l'assenza dell'utente rilevabile dai tempi di risposta.
const SALT_FITTIZIO = 'MDEyMzQ1Njc4OWFiY2RlZg=='
const HASH_FITTIZIO = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='

export async function verificaFittizia(password: string): Promise<void> {
  await verificaPassword(password, HASH_FITTIZIO, SALT_FITTIZIO, ITERAZIONI)
}

async function hmac(segreto: string, dati: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(segreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dati))
  return new Uint8Array(sig)
}

export async function creaJWT(
  payload: Omit<SessioneUtente, 'exp'>,
  segreto: string,
  durataSec = 60 * 60 * 24 * 30,
  adesso = Date.now(),
): Promise<string> {
  const header = b64urlStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const exp = Math.floor(adesso / 1000) + durataSec
  const body = b64urlStr(JSON.stringify({ ...payload, exp }))
  const firma = b64url(await hmac(segreto, `${header}.${body}`))
  return `${header}.${body}.${firma}`
}

export async function verificaJWT(token: string, segreto: string, adesso = Date.now()): Promise<SessioneUtente | null> {
  const parti = token.split('.')
  if (parti.length !== 3) return null
  const [header, body, firma] = parti
  const attesa = b64url(await hmac(segreto, `${header}.${body}`))
  if (!confrontoCostante(enc.encode(firma), enc.encode(attesa))) return null
  let payload: SessioneUtente
  try {
    payload = JSON.parse(new TextDecoder().decode(deb64url(body))) as SessioneUtente
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < adesso) return null
  return payload
}

export function estraiBearer(req: Request): string | null {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}
