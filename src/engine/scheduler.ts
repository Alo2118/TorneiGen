import type { Match } from './types'

export interface CalendarioConfig {
  giornate: { data: string; inizio: string; fine: string }[]
  numeroCampi: number
  durataMin: number
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const fromMin = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export function pianifica(partite: Match[], config: CalendarioConfig): Match[] {
  // slot disponibili: per giornata, per orario, per campo — ordinati per tempo poi campo
  const slots: { orario: string; campo: number }[] = []
  for (const g of config.giornate) {
    const inizio = toMin(g.inizio)
    const fine = toMin(g.fine)
    for (let t = inizio; t + config.durataMin <= fine; t += config.durataMin) {
      for (let c = 1; c <= config.numeroCampi; c++) {
        slots.push({ orario: `${g.data}T${fromMin(t)}`, campo: c })
      }
    }
  }

  const peso = (mm: Match): number => {
    const tipo = mm.tabelloneTipo === 'perdenti' ? 1 : mm.tabelloneTipo === 'finale' ? 2 : 0
    return tipo * 100000 + (mm.round ?? 0) * 1000 + (mm.posizioneTabellone ?? 0)
  }
  const ordinate = [...partite].sort((a, b) => peso(a) - peso(b))

  const usati = new Set<number>()
  const orariSquadra = new Map<string, Set<string>>()
  const occupato = (team: string | null, orario: string): boolean =>
    !!team && (orariSquadra.get(team)?.has(orario) ?? false)
  const segna = (team: string | null, orario: string): void => {
    if (!team) return
    if (!orariSquadra.has(team)) orariSquadra.set(team, new Set())
    orariSquadra.get(team)!.add(orario)
  }

  const result = new Map(partite.map((mm) => [mm.id, { ...mm }]))
  for (const mm of ordinate) {
    for (let i = 0; i < slots.length; i++) {
      if (usati.has(i)) continue
      const s = slots[i]
      if (occupato(mm.teamAId, s.orario) || occupato(mm.teamBId, s.orario)) continue
      usati.add(i)
      const upd = result.get(mm.id)!
      upd.orario = s.orario
      upd.campo = String(s.campo)
      segna(mm.teamAId, s.orario)
      segna(mm.teamBId, s.orario)
      break
    }
  }
  return partite.map((mm) => result.get(mm.id)!)
}
