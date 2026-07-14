import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, Toaster, useToast } from './Toast'

function Demo() {
  const toast = useToast()
  return <button onClick={() => toast('Salvato')}>fai</button>
}

describe('Toast', () => {
  it('mostra un toast quando invocato', async () => {
    render(<ToastProvider><Demo /><Toaster /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: /fai/i }))
    expect(await screen.findByText('Salvato')).toBeInTheDocument()
  })
})
