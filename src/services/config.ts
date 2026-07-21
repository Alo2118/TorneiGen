import { creaClient, type RegistrationsClient } from './registrations-api'

const DEFAULT_BASE = 'http://localhost:8787'

export function getSavedApiBaseUrl(): string {
  return localStorage.getItem('apiBaseUrl') ?? ''
}

export function getApiBaseUrl(): string {
  const saved = getSavedApiBaseUrl()
  if (saved) return saved
  const env = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  return env || DEFAULT_BASE
}

export function setApiBaseUrl(v: string): void {
  localStorage.setItem('apiBaseUrl', v.trim())
}

export function getSessione(): string | undefined {
  return localStorage.getItem('sessione') ?? undefined
}

export function setSessione(v: string): void {
  localStorage.setItem('sessione', v)
}

export function clearSessione(): void {
  localStorage.removeItem('sessione')
}

export function getClient(): RegistrationsClient {
  return creaClient({ baseUrl: getApiBaseUrl(), sessione: getSessione() })
}
