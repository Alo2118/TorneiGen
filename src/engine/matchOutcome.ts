import type { SetScore, RegolePunteggio } from './types'

export function setWinner(
  set: SetScore,
  target: number,
  vittoriaConDue: boolean,
  cap?: number,
): 'A' | 'B' | null {
  const { puntiA, puntiB } = set
  const max = Math.max(puntiA, puntiB)
  const diff = Math.abs(puntiA - puntiB)
  if (max < target) return null
  if (vittoriaConDue) {
    const raggiuntoCap = cap !== undefined && max >= cap
    if (!raggiuntoCap && diff < 2) return null
  }
  if (puntiA === puntiB) return null
  return puntiA > puntiB ? 'A' : 'B'
}

export function matchOutcome(
  sets: SetScore[],
  r: RegolePunteggio,
): { vincitore: 'A' | 'B' | null; setA: number; setB: number; completa: boolean } {
  const setNecessari = Math.ceil(r.setAlMeglioDi / 2)
  let setA = 0
  let setB = 0
  sets.forEach((s, i) => {
    const isSpareggio = r.setAlMeglioDi === 3 && i === 2
    const target = isSpareggio ? r.puntiTieBreak : r.puntiSet
    const w = setWinner(s, target, r.vittoriaConDue, r.cap)
    if (w === 'A') setA++
    else if (w === 'B') setB++
  })
  let vincitore: 'A' | 'B' | null = null
  if (setA >= setNecessari) vincitore = 'A'
  else if (setB >= setNecessari) vincitore = 'B'
  return { vincitore, setA, setB, completa: vincitore !== null }
}
