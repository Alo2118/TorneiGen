import type { StandingRow } from './types'

export function splitIntoGroups(teamIds: string[], numeroGironi: number): string[][] {
  if (numeroGironi <= 0) throw new Error('numeroGironi deve essere maggiore di 0')
  const gironi: string[][] = Array.from({ length: numeroGironi }, () => [])
  teamIds.forEach((id, i) => {
    const giro = Math.floor(i / numeroGironi)
    const posInGiro = i % numeroGironi
    // serpentina: righe pari da sinistra, dispari da destra
    const idx = giro % 2 === 0 ? posInGiro : numeroGironi - 1 - posInGiro
    gironi[idx].push(id)
  })
  return gironi
}

export function qualifiedTeams(
  standingsPerGirone: StandingRow[][],
  perGirone: number,
): string[] {
  const q: string[] = []
  for (let pos = 0; pos < perGirone; pos++) {
    for (const girone of standingsPerGirone) {
      if (girone[pos]) q.push(girone[pos].teamId)
    }
  }
  return q
}
