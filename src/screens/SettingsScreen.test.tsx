import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SettingsScreen } from './SettingsScreen'
import { getApiBaseUrl, getReadToken } from '../services/config'

describe('SettingsScreen', () => {
  beforeEach(() => localStorage.clear())

  it('salva URL API e token', async () => {
    render(<MemoryRouter><SettingsScreen /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText(/url api/i), 'https://api.esempio.dev')
    await userEvent.type(screen.getByLabelText(/token/i), 'segreto')
    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(getApiBaseUrl()).toBe('https://api.esempio.dev')
    expect(getReadToken()).toBe('segreto')
  })
})
