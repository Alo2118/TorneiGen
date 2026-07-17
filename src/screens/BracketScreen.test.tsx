import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider, Toaster } from '../components/Toast'
import { db } from '../db/database'
import { saveTournament } from '../db/repositories'
import { BracketScreen } from './BracketScreen'
import type { Tournament, Team } from '../engine/types'

vi.mock('../services/orgSync', () => ({
  notificaModificaOrg: vi.fn(),
  sincronizzabile: () => false,
}))
import { notificaModificaOrg } from '../services/orgSync'

const t: Tournament = {
  id: 't1', nome: 'Coppa', tipologia: '2x2', formato: 'girone_italiana', data: '2026-07-13',
  stato: 'bozza', regolePunteggio: { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }, codiceIscrizione: 'AAA',
}
function team(id: string): Team {
  return { id, tournamentId: 't1', nome: id, stato: 'confermata', origine: 'manuale', players: [] }
}

describe('BracketScreen', () => {
  beforeEach(async () => {
    await Promise.all([db.tournaments.clear(), db.teams.clear(), db.groups.clear(), db.matches.clear()])
    await saveTournament(t)
    await db.teams.bulkPut([team('A'), team('B'), team('C')])
  })

  it('genera le partite del girone al click su Genera', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /genera/i }))
    // 3 squadre round robin = 3 partite: A gioca 2 volte, quindi il suo nome compare più volte
    expect((await screen.findAllByText('A')).length).toBeGreaterThan(0)
    expect((await db.matches.where('tournamentId').equals('t1').toArray()).length).toBe(3)
  })

  it('apre il controllo punteggio, salva il risultato e aggiorna la vista', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /genera/i }))

    const [primoBottone] = await screen.findAllByRole('button', { name: /inserisci risultato/i })
    await userEvent.click(primoBottone)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const piuA = screen.getByRole('button', { name: /aumenta punteggio squadra a, set 1/i })
    for (let i = 0; i < 21; i++) fireEvent.click(piuA)
    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    // Race-tolerant: il dialog può già essersi chiuso prima che l'assert inizi ad
    // osservare (waitForElementToBeRemoved lancerebbe in quel caso). waitFor con
    // queryByRole invece passa sia se il dialog è già assente sia se sparisce dopo.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Verifica deterministica dell'esito reale: il salvataggio è avvenuto in db,
    // indipendentemente dai tempi di chiusura del dialog.
    await waitFor(async () => {
      const salvate = await db.matches.where('tournamentId').equals('t1').toArray()
      expect(salvate.some((m) => m.stato === 'conclusa')).toBe(true)
    })
  })

  it('sposta il focus dentro il dialog all\'apertura e lo ripristina sul trigger alla chiusura', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /genera/i }))

    const [trigger] = await screen.findAllByRole('button', { name: /inserisci risultato/i })
    await userEvent.click(trigger)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('genera usando solo le squadre confermate', async () => {
    // 3 confermate + 1 in attesa
    await db.teams.bulkPut([
      { id: 'A', tournamentId: 't1', nome: 'A', stato: 'confermata', origine: 'manuale', players: [] },
      { id: 'B', tournamentId: 't1', nome: 'B', stato: 'confermata', origine: 'manuale', players: [] },
      { id: 'C', tournamentId: 't1', nome: 'C', stato: 'confermata', origine: 'manuale', players: [] },
      { id: 'D', tournamentId: 't1', nome: 'D', stato: 'in_attesa', origine: 'online', players: [] },
    ])
    render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /genera/i }))
    await waitFor(async () => {
      const matches = await db.matches.where('tournamentId').equals('t1').toArray()
      // 3 squadre confermate a girone all'italiana = 3 partite (D esclusa)
      expect(matches.length).toBe(3)
    })
  })

  it('eliminazione doppia: mostra tutti i match del tabellone (vincenti/perdenti/finale) nell\'albero', async () => {
    await db.tournaments.update('t1', { formato: 'eliminazione_doppia' })
    await db.matches.bulkPut([
      { id: 'wb-r1-i0', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'vincenti', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata' },
      { id: 'lb-r1-i0', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'perdenti', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
      { id: 'gf', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'finale', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
    ])
    const { container } = render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Tabellone')).toBeInTheDocument()
    // wb + lb + finale = 3 riquadri partita nell'albero
    expect(container.querySelectorAll('.match-box').length).toBe(3)
  })

  it('doppia: il golden set fa parte dell\'albero del tabellone', async () => {
    await db.tournaments.update('t1', { formato: 'eliminazione_doppia' })
    await db.matches.bulkPut([
      { id: 'gf', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'finale', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata' },
      { id: 'golden', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'golden', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
    ])
    const { container } = render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Tabellone')
    // finale + golden = 2 riquadri partita
    expect(container.querySelectorAll('.match-box').length).toBe(2)
  })

  it('doppia: il campione è il vincitore del golden quando giocato (corona sul riquadro giusto)', async () => {
    await db.tournaments.update('t1', { formato: 'eliminazione_doppia' })
    await db.matches.bulkPut([
      { id: 'gf', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'finale', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 15, puntiB: 21 }], stato: 'conclusa', vincitoreId: 'B' },
      { id: 'golden', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'golden', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 18 }], stato: 'conclusa', vincitoreId: 'A' },
    ])
    const { container } = render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Tabellone')
    const righeVincenti = Array.from(container.querySelectorAll('.match-box-row-vince'))
    const rigaA = righeVincenti.find((el) => el.textContent?.includes('A'))
    const rigaB = righeVincenti.find((el) => el.textContent?.includes('B'))
    // il golden set è stato giocato e vinto da A: la corona va sul suo riquadro,
    // non su quello di B (che ha comunque vinto la finale)
    expect(rigaA?.textContent).toContain('🏆')
    expect(rigaB?.textContent).not.toContain('🏆')
  })

  it('doppia: il campione è lo slot vincenti se vince la finale (golden non giocato)', async () => {
    await db.tournaments.update('t1', { formato: 'eliminazione_doppia' })
    await db.matches.bulkPut([
      { id: 'gf', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'finale', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 15 }], stato: 'conclusa', vincitoreId: 'A' },
      { id: 'golden', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'golden', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
    ])
    const { container } = render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Tabellone')
    const rigaA = Array.from(container.querySelectorAll('.match-box-row-vince')).find((el) =>
      el.textContent?.includes('A'),
    )
    expect(rigaA?.textContent).toContain('🏆')
  })

  it('doppia: nessun campione se la finale non è ancora conclusa', async () => {
    await db.tournaments.update('t1', { formato: 'eliminazione_doppia' })
    await db.matches.bulkPut([
      { id: 'gf', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'finale', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [], stato: 'programmata' },
      { id: 'golden', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'golden', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
    ])
    const { container } = render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Tabellone')
    expect(container.textContent).not.toContain('🏆')
  })

  it('doppia: nessun campione se i perdenti vincono la finale senza golden', async () => {
    await db.tournaments.update('t1', { formato: 'eliminazione_doppia' })
    await db.matches.bulkPut([
      { id: 'gf', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'finale', round: 1, posizioneTabellone: 0, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 10, puntiB: 21 }], stato: 'conclusa', vincitoreId: 'B' },
      { id: 'golden', tournamentId: 't1', fase: 'tabellone', tabelloneTipo: 'golden', round: 1, posizioneTabellone: 0, teamAId: null, teamBId: null, set: [], stato: 'programmata' },
    ])
    const { container } = render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Tabellone')
    // B ha vinto la finale (riga evidenziata) ma senza corona: serve il golden per essere campione
    const rigaVincente = container.querySelector('.match-box-row-vince')
    expect(rigaVincente).toBeTruthy()
    expect(rigaVincente?.textContent).not.toContain('🏆')
    expect(container.textContent).not.toContain('🏆')
  })

  it('gironi+eliminazione: genera la fase finale dai gironi', async () => {
    await db.tournaments.update('t1', { formato: 'gironi_eliminazione', faseFinale: 'diretta', qualificatiPerGirone: 'tutti' })
    await db.groups.bulkPut([{ id: 'g1', tournamentId: 't1', nome: 'A', teamIds: ['A', 'B'] }])
    await db.matches.bulkPut([
      { id: 'gm', tournamentId: 't1', fase: 'girone', groupId: 'g1', round: 1, teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 10 }], vincitoreId: 'A', stato: 'conclusa' },
    ])
    render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /genera fase finale/i }))
    await waitFor(async () => {
      const tab = (await db.matches.where('tournamentId').equals('t1').toArray()).filter((m) => m.fase === 'tabellone')
      expect(tab.length).toBeGreaterThan(0)
    })
  })

  it('notifica la modifica organizzazione dopo la generazione', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/t1/tabellone']}>
        <ToastProvider>
          <Routes><Route path="/tornei/:id/tabellone" element={<BracketScreen />} /></Routes>
          <Toaster />
        </ToastProvider>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /genera/i }))
    await waitFor(() => expect(notificaModificaOrg).toHaveBeenCalled())
  })
})
