import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflittoOrgBanner } from './ConflittoOrgBanner'
import type { OrgSync } from '../services/useOrgSync'

function sync(over: Partial<OrgSync>): OrgSync {
  return { conflitto: null, risolviCloud: vi.fn(async () => {}), risolviLocale: vi.fn(async () => {}), ...over }
}

describe('ConflittoOrgBanner', () => {
  it('non mostra nulla senza conflitto', () => {
    const { container } = render(<ConflittoOrgBanner sync={sync({ conflitto: null })} />)
    expect(container.firstChild).toBeNull()
  })

  it('mostra il banner e invoca le due azioni', () => {
    const risolviCloud = vi.fn(async () => {})
    const risolviLocale = vi.fn(async () => {})
    const s = sync({ conflitto: { versioneCloud: 4, docCloud: {} as never }, risolviCloud, risolviLocale })
    render(<ConflittoOrgBanner sync={s} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Usa quelle dal cloud' }))
    expect(risolviCloud).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sovrascrivi con le mie' }))
    expect(risolviLocale).toHaveBeenCalled()
  })
})
