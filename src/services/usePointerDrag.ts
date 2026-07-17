import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

interface Opzioni {
  soglia?: number
  onInizio?: () => void
  onMuovi?: (x: number, y: number) => void
  onRilascia?: (x: number, y: number) => void
}

export function usePointerDrag(opz: Opzioni = {}): {
  trascinando: boolean
  handlers: { onPointerDown: (e: ReactPointerEvent) => void }
} {
  const { soglia = 6 } = opz
  const [trascinando, setTrascinando] = useState(false)
  const stato = useRef<{ x0: number; y0: number; attivo: boolean } | null>(null)
  const opzRef = useRef(opz)
  opzRef.current = opz

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      stato.current = { x0: e.clientX, y0: e.clientY, attivo: false }

      const muovi = (ev: PointerEvent) => {
        const s = stato.current
        if (!s) return
        if (!s.attivo) {
          if (Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0) < soglia) return
          s.attivo = true
          setTrascinando(true)
          opzRef.current.onInizio?.()
        }
        opzRef.current.onMuovi?.(ev.clientX, ev.clientY)
      }
      const rilascia = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', muovi)
        window.removeEventListener('pointerup', rilascia)
        const s = stato.current
        stato.current = null
        if (s?.attivo) {
          setTrascinando(false)
          opzRef.current.onRilascia?.(ev.clientX, ev.clientY)
        }
      }
      window.addEventListener('pointermove', muovi)
      window.addEventListener('pointerup', rilascia)
    },
    [soglia],
  )

  return { trascinando, handlers: { onPointerDown } }
}
