import { useEffect, useState } from 'react'
import QRCodeLib from 'qrcode'

interface Props {
  value: string
  size?: number
}

export function QRCode({ value, size = 160 }: Props) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let attivo = true
    QRCodeLib.toDataURL(value, { width: size, margin: 1 })
      .then((d) => { if (attivo) setSrc(d) })
      .catch(() => { if (attivo) setSrc('') })
    return () => { attivo = false }
  }, [value, size])
  if (!src) return null
  return <img className="qr-code" src={src} width={size} height={size} alt="Codice QR del link pubblico" />
}
