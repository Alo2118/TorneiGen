import type { Tournament, Team, Match } from '../engine/types'

export function prossimoPasso(
  t: Tournament,
  teams: Team[],
  matches: Match[],
): { testo: string; azione: 'squadre' | 'conferma' | 'genera' | 'calendario' | 'punteggi' | 'nessuno'; rotta: string } {
  const inAttesa = teams.filter((x) => x.stato === 'in_attesa').length
  const confermate = teams.filter((x) => x.stato === 'confermata').length
  const r = (suffix: string) => `/tornei/${t.id}/${suffix}`

  if (matches.length > 0) {
    const daProgrammare = !!t.giornate && t.giornate.length > 0 && matches.every((m) => !m.orario)
    if (daProgrammare) {
      return { testo: 'Programma il calendario delle partite.', azione: 'calendario', rotta: r('calendario') }
    }
    return { testo: 'Inserisci i risultati delle partite.', azione: 'punteggi', rotta: r('tabellone') }
  }
  if (teams.length === 0) {
    return { testo: 'Aggiungi le squadre o apri le iscrizioni online.', azione: 'squadre', rotta: r('squadre') }
  }
  if (inAttesa > 0) {
    return { testo: `Conferma ${inAttesa} squadr${inAttesa === 1 ? 'a' : 'e'} in attesa.`, azione: 'conferma', rotta: r('squadre') }
  }
  if (confermate >= 2) {
    return { testo: 'Genera il tabellone del torneo.', azione: 'genera', rotta: r('tabellone') }
  }
  return { testo: 'Aggiungi almeno 2 squadre confermate.', azione: 'squadre', rotta: r('squadre') }
}
