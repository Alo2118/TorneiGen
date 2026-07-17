import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { usePointerDrag } from './usePointerDrag'

function Prova({ onRilascia, onInizio }: { onRilascia: (x: number, y: number) => void; onInizio: () => void }) {
  const { trascinando, handlers } = usePointerDrag({ soglia: 6, onInizio, onRilascia })
  return <div data-testid="drag" data-trascinando={trascinando} {...handlers}>drag</div>
}

describe('usePointerDrag', () => {
  it('non inizia il drag sotto la soglia', () => {
    const onInizio = vi.fn(); const onRilascia = vi.fn()
    render(<Prova onInizio={onInizio} onRilascia={onRilascia} />)
    fireEvent.pointerDown(screen.getByTestId('drag'), { clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(window, { clientX: 3, clientY: 0 })
    fireEvent.pointerUp(window, { clientX: 3, clientY: 0 })
    expect(onInizio).not.toHaveBeenCalled()
    expect(onRilascia).not.toHaveBeenCalled()
  })

  it('inizia il drag oltre la soglia e rilascia con le coordinate', () => {
    const onInizio = vi.fn(); const onRilascia = vi.fn()
    render(<Prova onInizio={onInizio} onRilascia={onRilascia} />)
    fireEvent.pointerDown(screen.getByTestId('drag'), { clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 5 })
    expect(onInizio).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('drag').getAttribute('data-trascinando')).toBe('true')
    fireEvent.pointerUp(window, { clientX: 30, clientY: 40 })
    expect(onRilascia).toHaveBeenCalledWith(30, 40)
  })

  it('rimuove i listener allo smontaggio a metà drag: pointerup successivo non chiama onRilascia', () => {
    const onInizio = vi.fn(); const onRilascia = vi.fn()
    const { unmount } = render(<Prova onInizio={onInizio} onRilascia={onRilascia} />)
    fireEvent.pointerDown(screen.getByTestId('drag'), { clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 5 })
    expect(onInizio).toHaveBeenCalledTimes(1)
    unmount()
    fireEvent.pointerUp(window, { clientX: 30, clientY: 40 })
    expect(onRilascia).not.toHaveBeenCalled()
  })

  it('un secondo pointerDown senza pointerup nel mezzo non impila una seconda sessione', () => {
    const onInizio = vi.fn(); const onRilascia = vi.fn()
    render(<Prova onInizio={onInizio} onRilascia={onRilascia} />)
    fireEvent.pointerDown(screen.getByTestId('drag'), { clientX: 0, clientY: 0, button: 0 })
    fireEvent.pointerDown(screen.getByTestId('drag'), { clientX: 100, clientY: 100, button: 0 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 5 })
    expect(onInizio).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(window, { clientX: 30, clientY: 40 })
    expect(onRilascia).toHaveBeenCalledTimes(1)
    expect(onRilascia).toHaveBeenCalledWith(30, 40)
  })
})
