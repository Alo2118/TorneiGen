import { useState } from 'react'
import type { RegolePunteggio, SetScore } from '../engine/types'
import { setWinner } from '../engine/matchOutcome'
import { Button } from './Button'

interface Props {
  regole: RegolePunteggio
  setIniziali: SetScore[]
  onSalva: (set: SetScore[]) => void
}

function seed(setIniziali: SetScore[], maxSets: number): SetScore[] {
  const base: SetScore[] = setIniziali.map((s) => ({ ...s }))
  while (base.length < maxSets) base.push({ puntiA: 0, puntiB: 0 })
  return base.slice(0, maxSets)
}

function targetSet(index: number, regole: RegolePunteggio): number {
  return regole.setAlMeglioDi === 3 && index === 2 ? regole.puntiTieBreak : regole.puntiSet
}

// Quanti set mostrare: si rivela il set successivo solo quando il precedente è
// concluso e nessuna delle due squadre ha ancora vinto il match. Riusa
// `setWinner` del motore: nessuna logica di punteggio duplicata qui.
function setDaMostrare(sets: SetScore[], regole: RegolePunteggio): number {
  const necessari = Math.ceil(regole.setAlMeglioDi / 2)
  let vinteA = 0
  let vinteB = 0
  let visibili = 1
  for (let i = 0; i < regole.setAlMeglioDi; i++) {
    const s = sets[i]
    if (!s) break
    const target = targetSet(i, regole)
    const vincitore = setWinner(s, target, regole.vittoriaConDue, regole.cap)
    if (vincitore === 'A') vinteA++
    if (vincitore === 'B') vinteB++
    if (vincitore && vinteA < necessari && vinteB < necessari && i + 1 < regole.setAlMeglioDi) {
      visibili = i + 2
    }
  }
  return Math.min(visibili, regole.setAlMeglioDi)
}

export function ScoreControl({ regole, setIniziali, onSalva }: Props) {
  const [sets, setSets] = useState<SetScore[]>(() => seed(setIniziali, regole.setAlMeglioDi))

  const visibili = setDaMostrare(sets, regole)
  const setAttivo = visibili - 1

  function setPunto(index: number, squadra: 'puntiA' | 'puntiB', raw: string) {
    const val = Math.max(0, Math.floor(Number(raw) || 0))
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, [squadra]: val } : s)))
  }

  return (
    <div className="score-control">
      <div className="score-control-sets">
        {sets.slice(0, visibili).map((s, i) => {
          const target = targetSet(i, regole)
          const isSpareggio = regole.setAlMeglioDi === 3 && i === 2
          const isSetPoint = Math.max(s.puntiA, s.puntiB) >= target - 1
          const classi = [
            'score-control-set',
            i === setAttivo ? 'score-control-set-active' : '',
            isSetPoint ? 'score-control-set-point' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div key={i} className={classi}>
              <span className="score-control-label">{isSpareggio ? 'Tie-break' : `Set ${i + 1}`}</span>
              <div className="score-control-teams">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="score-control-input tnum"
                  aria-label={`Punteggio squadra A, set ${i + 1}`}
                  value={s.puntiA}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPunto(i, 'puntiA', e.target.value)}
                />
                <span className="score-control-sep">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="score-control-input tnum"
                  aria-label={`Punteggio squadra B, set ${i + 1}`}
                  value={s.puntiB}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPunto(i, 'puntiB', e.target.value)}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="score-control-actions">
        <Button type="button" onClick={() => onSalva(sets.slice(0, visibili))}>
          Salva
        </Button>
      </div>
    </div>
  )
}
