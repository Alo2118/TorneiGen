import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/database'
import { listTournaments, saveTournament } from '../db/repositories'
import { SetupScreen } from './SetupScreen'
import type { Tournament } from '../engine/types'

describe('SetupScreen', () => {
  beforeEach(async () => { await db.tournaments.clear() })

  it('crea un nuovo torneo e lo salva', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/nuovo']}>
        <Routes>
          <Route path="/tornei/nuovo" element={<SetupScreen />} />
          <Route path="/tornei/:id/squadre" element={<div>squadre</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText(/^nome$/i), 'Coppa Estate')
    await userEvent.type(screen.getAllByLabelText(/^data$/i)[0], '2026-08-01')
    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(await screen.findByText('squadre')).toBeInTheDocument()
    const all = await listTournaments()
    expect(all[0].nome).toBe('Coppa Estate')
    expect(all[0].stato).toBe('bozza')
    expect(all[0].codiceIscrizione).toHaveLength(6)
    expect(all[0].regolePunteggio).toEqual({
      setAlMeglioDi: 1,
      puntiSet: 21,
      puntiTieBreak: 15,
      vittoriaConDue: true,
    })
    expect(all[0].giornate).toEqual([{ data: '2026-08-01', inizio: '19:00', fine: '23:00' }])
    expect(all[0].numeroCampi).toBe(1)
    expect(all[0].durataPartitaMin).toBe(30)
  })

  it('permette di aggiungere e rimuovere giornate e di impostare campi/durata', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/nuovo']}>
        <Routes>
          <Route path="/tornei/nuovo" element={<SetupScreen />} />
          <Route path="/tornei/:id/squadre" element={<div>squadre</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText(/^nome$/i), 'Coppa Autunno')
    await userEvent.type(screen.getAllByLabelText(/^data$/i)[0], '2026-09-01')

    await userEvent.click(screen.getByRole('button', { name: /aggiungi giornata/i }))
    expect(screen.getByText('Giornata 2')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: /rimuovi giornata/i })[0])
    expect(screen.queryByText('Giornata 2')).not.toBeInTheDocument()

    const numeroCampiInput = screen.getByLabelText(/numero campi/i)
    await userEvent.clear(numeroCampiInput)
    await userEvent.type(numeroCampiInput, '3')

    const durataInput = screen.getByLabelText(/durata partita/i)
    await userEvent.clear(durataInput)
    await userEvent.type(durataInput, '25')

    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(await screen.findByText('squadre')).toBeInTheDocument()

    const all = await listTournaments()
    expect(all[0].giornate).toEqual([{ data: '2026-09-01', inizio: '19:00', fine: '23:00' }])
    expect(all[0].numeroCampi).toBe(3)
    expect(all[0].durataPartitaMin).toBe(25)
  })

  it('mostra una nota quando il formato è king of the court', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/nuovo']}>
        <Routes>
          <Route path="/tornei/nuovo" element={<SetupScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.selectOptions(screen.getByLabelText(/formato/i), 'king_of_the_court')
    expect(await screen.findByText(/disponibile a breve/i)).toBeInTheDocument()
  })

  it('carica un torneo esistente in modalità modifica', async () => {
    const esistente: Tournament = {
      id: 't1',
      nome: 'Torneo esistente',
      tipologia: '4x4',
      formato: 'eliminazione_diretta',
      data: '2026-08-01',
      stato: 'iscrizioni_aperte',
      regolePunteggio: { setAlMeglioDi: 3, puntiSet: 25, puntiTieBreak: 15, vittoriaConDue: true },
      codiceIscrizione: 'ZZZ111',
    }
    await saveTournament(esistente)

    render(
      <MemoryRouter initialEntries={['/tornei/t1/setup']}>
        <Routes>
          <Route path="/tornei/:id/setup" element={<SetupScreen />} />
          <Route path="/tornei/:id/squadre" element={<div>squadre</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Torneo esistente')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(await screen.findByText('squadre')).toBeInTheDocument()

    const all = await listTournaments()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('t1')
    expect(all[0].codiceIscrizione).toBe('ZZZ111')
    expect(all[0].stato).toBe('iscrizioni_aperte')
  })

  it('mostra e salva la sezione fase finale solo per gironi + eliminazione', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/nuovo']}>
        <Routes>
          <Route path="/tornei/nuovo" element={<SetupScreen />} />
          <Route path="/tornei/:id/squadre" element={<div>squadre</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByLabelText(/^fase finale$/i)).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/^nome$/i), 'Coppa Inverno')
    await userEvent.type(screen.getAllByLabelText(/^data$/i)[0], '2026-12-01')
    await userEvent.selectOptions(screen.getByLabelText(/^formato$/i), 'gironi_eliminazione')

    expect(screen.getByLabelText(/^fase finale$/i)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/^fase finale$/i), 'doppia')
    expect(screen.getByText(/potenza di 2/i)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/qualificati per girone/i), '2')

    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(await screen.findByText('squadre')).toBeInTheDocument()

    const all = await listTournaments()
    expect(all[0].faseFinale).toBe('doppia')
    expect(all[0].qualificatiPerGirone).toBe(2)
  })

  it('usa i default fase finale "diretta" e qualificati "tutti" quando non modificati', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/nuovo']}>
        <Routes>
          <Route path="/tornei/nuovo" element={<SetupScreen />} />
          <Route path="/tornei/:id/squadre" element={<div>squadre</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText(/^nome$/i), 'Coppa Primavera')
    await userEvent.type(screen.getAllByLabelText(/^data$/i)[0], '2026-03-01')
    await userEvent.selectOptions(screen.getByLabelText(/^formato$/i), 'gironi_eliminazione')

    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(await screen.findByText('squadre')).toBeInTheDocument()

    const all = await listTournaments()
    expect(all[0].faseFinale).toBe('diretta')
    expect(all[0].qualificatiPerGirone).toBe('tutti')
  })

  it('reindirizza alla home se il torneo da modificare non esiste', async () => {
    render(
      <MemoryRouter initialEntries={['/tornei/does-not-exist/setup']}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/tornei/:id/setup" element={<SetupScreen />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('home')).toBeInTheDocument()
  })
})
