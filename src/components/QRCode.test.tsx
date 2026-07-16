import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') },
}))

import { QRCode } from './QRCode'

describe('QRCode', () => {
  it('rende un\'immagine col data URL generato', async () => {
    render(<QRCode value="https://x/pubblico/ABC" />)
    await waitFor(() => expect(screen.getByRole('img')).toBeTruthy())
    expect(screen.getByRole('img').getAttribute('src')).toContain('data:image/png')
  })
})
