import type { Match } from './types'

export const CAMPO_VUOTO = 'Da definire'

export interface CellaGriglia {
  orario: string
  campo: string
  partite: Match[]
}
export interface GiornataGriglia {
  data: string
  campi: string[]
  orari: string[]
  celle: CellaGriglia[]
}

function ordinaCampi(campi: string[]): string[] {
  return [...campi].sort((a, b) => {
    if (a === CAMPO_VUOTO) return 1
    if (b === CAMPO_VUOTO) return -1
    const na = Number(a)
    const nb = Number(b)
    const aNum = a.trim() !== '' && !Number.isNaN(na)
    const bNum = b.trim() !== '' && !Number.isNaN(nb)
    if (aNum && bNum) return na - nb
    if (aNum) return -1
    if (bNum) return 1
    return a.localeCompare(b)
  })
}

export function buildCalendarGrid(matches: Match[]): GiornataGriglia[] {
  const programmate = matches.filter((m): m is Match & { orario: string } => !!m.orario)
  const perData = new Map<string, Match[]>()
  for (const m of programmate) {
    const data = m.orario.slice(0, 10)
    const lista = perData.get(data) ?? []
    lista.push(m)
    perData.set(data, lista)
  }

  const campoDi = (m: Match): string => (m.campo && m.campo.trim() !== '' ? m.campo : CAMPO_VUOTO)
  const oraDi = (m: Match): string => m.orario!.slice(11, 16)

  return [...perData.keys()]
    .sort()
    .map((data) => {
      const ms = perData.get(data)!
      const campi = ordinaCampi([...new Set(ms.map(campoDi))])
      const orari = [...new Set(ms.map(oraDi))].sort()
      const celle: CellaGriglia[] = []
      for (const orario of orari) {
        for (const campo of campi) {
          celle.push({ orario, campo, partite: ms.filter((m) => oraDi(m) === orario && campoDi(m) === campo) })
        }
      }
      return { data, campi, orari, celle }
    })
}

export function nuovaCollocazione(data: string, orario: string, campo: string): { orario: string; campo: string } {
  return { orario: `${data}T${orario}`, campo: campo === CAMPO_VUOTO ? '' : campo }
}
