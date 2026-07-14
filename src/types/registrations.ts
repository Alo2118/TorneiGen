export interface GiocatoreIscrizione {
  nome: string
  cognome: string
  email: string
  telefono: string
}

export interface Iscrizione {
  id: string
  codice: string
  nomeSquadra: string
  giocatori: GiocatoreIscrizione[]
  createdAt: string
}

export interface Riepilogo {
  codice: string
  nome: string
  tipologia: '2x2' | '4x4'
  formato: string | null
  chiuso: boolean
  updatedAt: string
}
