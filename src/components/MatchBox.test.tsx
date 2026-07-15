import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MatchBox } from './MatchBox'
import type { Match } from '../engine/types'

const base: Match = {
  id: 'm', tournamentId: 't', fase: 'tabellone', round: 1, posizioneTabellone: 0,
  teamAId: 'A', teamBId: 'B', set: [{ puntiA: 21, puntiB: 15 }], stato: 'conclusa', vincitoreId: 'A',
}
const names = { A: 'Rossi', B: 'Bianchi' }

describe('MatchBox', () => {
  it('mostra i nomi delle squadre e i punteggi', () => {
    render(<MatchBox match={base} teamNames={names} />)
    expect(screen.getByText('Rossi')).toBeTruthy()
    expect(screen.getByText('Bianchi')).toBeTruthy()
    expect(screen.getByText('21')).toBeTruthy()
  })
  it('evidenzia il vincitore', () => {
    const { container } = render(<MatchBox match={base} teamNames={names} />)
    expect(container.querySelector('.match-box-row-vince')).toBeTruthy()
  })
  it('con onClick e due squadre è un bottone e chiama onClick', () => {
    const onClick = vi.fn()
    render(<MatchBox match={base} teamNames={names} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledWith(base)
  })
  it('senza entrambe le squadre non è cliccabile', () => {
    const daDefinire: Match = { ...base, teamBId: null, set: [], vincitoreId: null, stato: 'programmata' }
    render(<MatchBox match={daDefinire} teamNames={names} onClick={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Da definire')).toBeTruthy()
  })
})
