import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type ToastTipo = 'successo' | 'errore'
type ToastItem = { id: number; msg: string; tipo: ToastTipo }
type ToastFn = (msg: string, tipo?: ToastTipo) => void

const ToastContext = createContext<ToastFn | null>(null)
const ToastListContext = createContext<ToastItem[]>([])

const DURATA_MS = 3000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const toast = useCallback<ToastFn>((msg, tipo = 'successo') => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, msg, tipo }])
    const timeout = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timers.current.delete(id)
    }, DURATA_MS)
    timers.current.set(id, timeout)
  }, [])

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((timeout) => clearTimeout(timeout))
      map.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      <ToastListContext.Provider value={toasts}>{children}</ToastListContext.Provider>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast va usato dentro ToastProvider')
  return ctx
}

export function Toaster() {
  const toasts = useContext(ToastListContext)
  if (toasts.length === 0) return null
  return (
    <div className="toaster" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tipo}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
