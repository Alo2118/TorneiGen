import type { Match, RegolePunteggio, SetScore, StandingRow } from './types'
import { matchOutcome, esitoGirone } from './matchOutcome'

function rigaVuota(teamId: string): StandingRow {
  return {
    teamId, giocate: 0, vinte: 0, perse: 0,
    setVinti: 0, setPersi: 0, puntiFatti: 0, puntiSubiti: 0,
  }
}

function quoziente(fatti: number, subiti: number): number {
  if (subiti === 0) return fatti === 0 ? 1 : Number.POSITIVE_INFINITY
  return fatti / subiti
}

export function computeStandings(
  teamIds: string[],
  matches: Match[],
  r: RegolePunteggio,
): StandingRow[] {
  const rows = new Map<string, StandingRow>()
  teamIds.forEach((id) => rows.set(id, rigaVuota(id)))

  // In modalità "punti a set" ogni set vale 1 punto: si giocano sempre 3 set e
  // la classifica è a set vinti. Altrimenti best-of-3 classico (partite vinte).
  const esito = (sets: SetScore[]) => (r.gironiPerSet ? esitoGirone(sets) : matchOutcome(sets, r))

  const validi = matches.filter(
    (m) =>
      m.stato === 'conclusa' &&
      m.teamAId && m.teamBId &&
      rows.has(m.teamAId) && rows.has(m.teamBId),
  )

  for (const m of validi) {
    const o = esito(m.set)
    if (!o.completa) continue
    const A = rows.get(m.teamAId as string)!
    const B = rows.get(m.teamBId as string)!
    A.giocate++; B.giocate++
    A.setVinti += o.setA; A.setPersi += o.setB
    B.setVinti += o.setB; B.setPersi += o.setA
    const puntiA = m.set.reduce((s, x) => s + x.puntiA, 0)
    const puntiB = m.set.reduce((s, x) => s + x.puntiB, 0)
    A.puntiFatti += puntiA; A.puntiSubiti += puntiB
    B.puntiFatti += puntiB; B.puntiSubiti += puntiA
    if (o.vincitore === 'A') { A.vinte++; B.perse++ } else { B.vinte++; A.perse++ }
  }

  // scontro diretto tra due squadre a pari punti
  function scontroDiretto(x: StandingRow, y: StandingRow): number {
    const m = validi.find(
      (mm) =>
        (mm.teamAId === x.teamId && mm.teamBId === y.teamId) ||
        (mm.teamAId === y.teamId && mm.teamBId === x.teamId),
    )
    if (!m) return 0
    const o = esito(m.set)
    if (!o.completa) return 0
    const vincitoreId = o.vincitore === 'A' ? m.teamAId : m.teamBId
    if (vincitoreId === x.teamId) return -1
    if (vincitoreId === y.teamId) return 1
    return 0
  }

  // Nota: lo scontro diretto risolve solo parità a due squadre. Parità a 3+
  // squadre con cicli non transitivi (es. A batte B, B batte C, C batte A)
  // non sono pienamente risolte da questo criterio: limitazione nota,
  // possibile evoluzione futura con la "classifica avulsa".
  return [...rows.values()].sort((a, b) => {
    if (r.gironiPerSet) {
      // ogni set = 1 punto: primo criterio i set vinti, poi il quoziente punti
      if (b.setVinti !== a.setVinti) return b.setVinti - a.setVinti
      const qpA = quoziente(a.puntiFatti, a.puntiSubiti)
      const qpB = quoziente(b.puntiFatti, b.puntiSubiti)
      if (qpB !== qpA) return qpB - qpA
      return scontroDiretto(a, b)
    }
    if (b.vinte !== a.vinte) return b.vinte - a.vinte
    const qsA = quoziente(a.setVinti, a.setPersi)
    const qsB = quoziente(b.setVinti, b.setPersi)
    if (qsB !== qsA) return qsB - qsA
    const qpA = quoziente(a.puntiFatti, a.puntiSubiti)
    const qpB = quoziente(b.puntiFatti, b.puntiSubiti)
    if (qpB !== qpA) return qpB - qpA
    return scontroDiretto(a, b)
  })
}
