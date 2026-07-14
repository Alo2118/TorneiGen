import { describe, it, expect, beforeEach } from 'vitest'
import { getApiBaseUrl, setApiBaseUrl, getReadToken, setReadToken } from './config'

describe('config', () => {
  beforeEach(() => localStorage.clear())

  it('usa il default quando localStorage è vuoto', () => {
    // in test import.meta.env.VITE_API_BASE_URL è undefined -> fallback localhost:8787
    expect(getApiBaseUrl()).toBe('http://localhost:8787')
  })

  it('salva e rilegge apiBaseUrl', () => {
    setApiBaseUrl('https://api.esempio.dev')
    expect(getApiBaseUrl()).toBe('https://api.esempio.dev')
  })

  it('token assente di default, poi salvato', () => {
    expect(getReadToken()).toBeUndefined()
    setReadToken('tok')
    expect(getReadToken()).toBe('tok')
  })
})
