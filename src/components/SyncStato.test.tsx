import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SyncStato } from './SyncStato'

vi.mock('../services/orgSync', () => ({ confrontaCloud: vi.fn(), tiraOrg: vi.fn() }))
import { confrontaCloud, tiraOrg } from '../services/orgSync'

describe('SyncStato', () => {
  beforeEach(() => vi.clearAllMocks())

  it('segnala gli aggiornamenti dal cloud con il pulsante Aggiorna', async () => {
    vi.mocked(confrontaCloud).mockResolvedValue({ stato: 'cloud_avanti', versioneCloud: 5 })
    render(<SyncStato tournamentId="t1" />)
    expect(await screen.findByText(/aggiornamenti dal cloud/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /aggiorna/i })).toBeInTheDocument()
  })

  it('il click su Aggiorna tira dal cloud e ricontrolla', async () => {
    vi.mocked(confrontaCloud)
      .mockResolvedValueOnce({ stato: 'cloud_avanti', versioneCloud: 5 })
      .mockResolvedValue({ stato: 'inpari', versioneCloud: 5 })
    vi.mocked(tiraOrg).mockResolvedValue({ stato: 'aggiornato', versioneCloud: 5 })
    render(<SyncStato tournamentId="t1" />)
    await userEvent.click(await screen.findByRole('button', { name: /aggiorna/i }))
    expect(tiraOrg).toHaveBeenCalledWith('t1')
    await waitFor(() => expect(screen.getByText(/sincronizzato/i)).toBeInTheDocument())
  })

  it('segnala il conflitto', async () => {
    vi.mocked(confrontaCloud).mockResolvedValue({ stato: 'conflitto', versioneCloud: 5 })
    render(<SyncStato tournamentId="t1" />)
    expect(await screen.findByText(/conflitto/i)).toBeInTheDocument()
  })

  it('offline non mostra nulla', async () => {
    vi.mocked(confrontaCloud).mockResolvedValue({ stato: 'offline' })
    const { container } = render(<SyncStato tournamentId="t1" />)
    await waitFor(() => expect(confrontaCloud).toHaveBeenCalled())
    expect(container.querySelector('.sync-stato')).toBeNull()
  })
})
