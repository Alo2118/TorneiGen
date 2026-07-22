import { useEffect, useMemo, useRef, useState } from 'react'
import type { Match } from '../engine/types'
import { layoutBracket, BOX_W, BOX_H } from '../engine/bracketLayout'
import type { BracketNode, BracketSegment } from '../engine/bracketLayout'
import { MatchBox } from './MatchBox'

interface Props {
  matches: Match[]
  teamNames: Record<string, string>
  variant: 'interattivo' | 'statico'
  onMatchClick?: (match: Match) => void
}

// connettore ortogonale dal bordo destro di "from" al bordo sinistro di "to"
function percorso(from: BracketNode, to: BracketNode): string {
  const x1 = from.x + from.w
  const y1 = from.y + from.h / 2
  const x2 = to.x
  const y2 = to.y + to.h / 2
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
}

export function BracketTree({ matches, teamNames, variant, onMatchClick }: Props) {
  const layout = useMemo(() => layoutBracket(matches), [matches])
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches])
  const nodeById = useMemo(() => new Map(layout.nodi.map((n) => [n.matchId, n])), [layout])

  const wrapRef = useRef<HTMLDivElement>(null)
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const PAD = 24
  const vbW = layout.larghezza + PAD * 2
  const vbH = layout.altezza + PAD * 2

  function adatta() {
    const w = wrapRef.current?.clientWidth ?? vbW
    setT({ scale: Math.min(1, w / vbW), x: 0, y: 0 })
  }
  // adatta di default alla larghezza al mount e quando l'albero cambia dimensione
  useEffect(() => {
    const w = wrapRef.current?.clientWidth ?? 0
    if (w > 0 && vbW > 0) setT({ scale: Math.min(1, w / vbW), x: 0, y: 0 })
  }, [vbW])
  function zoom(fattore: number) {
    setT((s) => ({ ...s, scale: Math.max(0.3, Math.min(2.5, s.scale * fattore)) }))
  }
  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX - t.x, y: e.clientY - t.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    setT((s) => ({ ...s, x: e.clientX - drag.current!.x, y: e.clientY - drag.current!.y }))
  }
  function onPointerUp() {
    drag.current = null
  }
  function onWheel(e: React.WheelEvent) {
    zoom(e.deltaY < 0 ? 1.1 : 0.9)
  }

  if (layout.nodi.length === 0) return null

  return (
    <div className="bracket-tree">
      <div className="bracket-tree-controls">
        <button type="button" onClick={() => zoom(1.2)} aria-label="Ingrandisci">+</button>
        <button type="button" onClick={() => zoom(0.83)} aria-label="Rimpicciolisci">−</button>
        <button type="button" onClick={adatta}>Adatta</button>
      </div>
      <p className="bracket-tree-hint">Trascina per esplorare · +/− per lo zoom</p>
      <div
        className="bracket-tree-viewport"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <svg width={vbW * t.scale} height={vbH * t.scale} viewBox={`0 0 ${vbW} ${vbH}`} style={{ display: 'block', transform: `translate(${t.x}px, ${t.y}px)`, transformOrigin: '0 0' }}>
          <g transform={`translate(${PAD}, ${PAD})`}>
            {layout.segmenti.map((s: BracketSegment, i) => {
              const from = nodeById.get(s.from)
              const to = nodeById.get(s.to)
              if (!from || !to) return null
              return (
                <path
                  key={i}
                  className={`bracket-segment bracket-segment-${s.tipo}`}
                  d={percorso(from, to)}
                  fill="none"
                />
              )
            })}
            {layout.nodi.map((n) => {
              const match = byId.get(n.matchId)
              if (!match) return null
              const campione = n.matchId === layout.campioneMatchId
              return (
                <foreignObject key={n.matchId} x={n.x} y={n.y} width={BOX_W} height={BOX_H}>
                  <MatchBox
                    match={match}
                    teamNames={teamNames}
                    campione={campione}
                    onClick={variant === 'interattivo' ? onMatchClick : undefined}
                  />
                </foreignObject>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}
