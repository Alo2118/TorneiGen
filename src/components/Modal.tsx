import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from './Button'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function elementiFocusabili(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

type Props = {
  open: boolean
  titolo: string
  onClose: () => void
  children: ReactNode
}

/**
 * Dialog modale accessibile e riusabile: sposta il focus dentro il pannello
 * all'apertura, intrappola il Tab al suo interno, chiude su Escape e
 * ripristina il focus sull'elemento che ha aperto il dialog alla chiusura.
 */
export function Modal({ open, titolo, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (panel) {
      const [primo] = elementiFocusabili(panel)
      ;(primo ?? panel).focus()
    }
    return () => {
      triggerRef.current?.focus()
      triggerRef.current = null
    }
  }, [open])

  if (!open) return null

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusabili = elementiFocusabili(panel)
    if (focusabili.length === 0) return
    const primo = focusabili[0]
    const ultimo = focusabili[focusabili.length - 1]
    const attivo = document.activeElement
    if (e.shiftKey) {
      if (attivo === primo || !panel.contains(attivo)) {
        e.preventDefault()
        ultimo.focus()
      }
    } else if (attivo === ultimo || !panel.contains(attivo)) {
      e.preventDefault()
      primo.focus()
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
      <div className="modal-panel" ref={panelRef} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId}>{titolo}</h2>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annulla
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}
