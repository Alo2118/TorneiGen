import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { useOrgSync } from './useOrgSync'
import { ConflittoOrgBanner } from '../components/ConflittoOrgBanner'
import { tiraOrg, risolviConflittoSovrascrivi } from './orgSync'

vi.mock('./orgSync', () => ({
  sincronizzabile: () => true,
  tiraOrg: vi.fn(),
  risolviConflittoUsaCloud: vi.fn(),
  risolviConflittoSovrascrivi: vi.fn(),
}))

function Cavia({ tournamentId }: { tournamentId: string }) {
  const sync = useOrgSync(tournamentId)
  return <ConflittoOrgBanner sync={sync} />
}

beforeEach(() => {
  vi.mocked(tiraOrg).mockReset()
  vi.mocked(risolviConflittoSovrascrivi).mockReset()
})

describe('useOrgSync', () => {
  it('mostra il banner di conflitto anche sotto StrictMode (regressione doppio mount)', async () => {
    vi.mocked(tiraOrg).mockResolvedValue({ stato: 'conflitto', versioneCloud: 4, docCloud: {} as never })

    render(
      <StrictMode>
        <Cavia tournamentId="t1" />
      </StrictMode>,
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('nessun conflitto: il banner non appare', async () => {
    vi.mocked(tiraOrg).mockResolvedValue({ stato: 'aggiornato', versioneCloud: 2 })

    render(<Cavia tournamentId="t1" />)

    await waitFor(() => expect(tiraOrg).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('risolviLocale: se il push di sovrascrittura fallisce il banner resta visibile', async () => {
    vi.mocked(tiraOrg).mockResolvedValue({ stato: 'conflitto', versioneCloud: 4, docCloud: {} as never })
    vi.mocked(risolviConflittoSovrascrivi).mockResolvedValue({ stato: 'errore' })

    render(<Cavia tournamentId="t1" />)
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: 'Sovrascrivi con le mie' }))

    await waitFor(() => expect(risolviConflittoSovrascrivi).toHaveBeenCalled())
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('risolviLocale: se il push di sovrascrittura riesce il banner scompare', async () => {
    vi.mocked(tiraOrg).mockResolvedValue({ stato: 'conflitto', versioneCloud: 4, docCloud: {} as never })
    vi.mocked(risolviConflittoSovrascrivi).mockResolvedValue({ stato: 'sincronizzato', versioneCloud: 5 })

    render(<Cavia tournamentId="t1" />)
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: 'Sovrascrivi con le mie' }))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
