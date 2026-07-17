import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SettingsScreen } from './SettingsScreen'
import { getApiBaseUrl, getReadToken } from '../services/config'

describe('SettingsScreen', () => {
  beforeEach(() => localStorage.clear())

  it('salva URL API e token', async () => {
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/url api/i), 'https://api.esempio.dev')
    await userEvent.type(screen.getByLabelText(/token di lettura/i), 'segreto')
    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(getApiBaseUrl()).toBe('https://api.esempio.dev')
    expect(getReadToken()).toBe('segreto')
  })

  it('salva il token di scrittura', () => {
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Token di scrittura'), { target: { value: 'segreto-w' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    expect(localStorage.getItem('writeToken')).toBe('segreto-w')
  })
})
