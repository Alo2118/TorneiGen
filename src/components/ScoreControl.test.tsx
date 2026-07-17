import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScoreControl } from './ScoreControl'
import type { RegolePunteggio } from '../engine/types'

const r: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }
const r3: RegolePunteggio = { setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

describe('ScoreControl', () => {
  it('salva i set digitati', () => {
    const onSalva = vi.fn()
    render(<ScoreControl regole={r} setIniziali={[]} onSalva={onSalva} />)
    fireEvent.change(screen.getByLabelText('Punteggio squadra A, set 1'), { target: { value: '21' } })
    fireEvent.change(screen.getByLabelText('Punteggio squadra B, set 1'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    expect(onSalva).toHaveBeenCalledWith([{ puntiA: 21, puntiB: 18 }])
  })

  it('rivela il set successivo quando il primo set è vinto (best of 3)', () => {
    render(<ScoreControl regole={r3} setIniziali={[]} onSalva={vi.fn()} />)
    expect(screen.queryByLabelText('Punteggio squadra A, set 2')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Punteggio squadra A, set 1'), { target: { value: '21' } })
    fireEvent.change(screen.getByLabelText('Punteggio squadra B, set 1'), { target: { value: '10' } })
    expect(screen.getByLabelText('Punteggio squadra A, set 2')).toBeInTheDocument()
  })

  it('non accetta valori negativi (li porta a 0)', () => {
    const onSalva = vi.fn()
    render(<ScoreControl regole={r} setIniziali={[]} onSalva={onSalva} />)
    fireEvent.change(screen.getByLabelText('Punteggio squadra A, set 1'), { target: { value: '-5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    expect(onSalva).toHaveBeenCalledWith([{ puntiA: 0, puntiB: 0 }])
  })

  it('marca il set attivo con la classe sea e nessun set point sotto soglia', () => {
    render(<ScoreControl regole={r} setIniziali={[]} onSalva={vi.fn()} />)
    const setEl = screen.getByText('Set 1').closest('.score-control-set')
    expect(setEl).toHaveClass('score-control-set-active')
    expect(setEl).not.toHaveClass('score-control-set-point')
  })

  it('evidenzia il set point quando il punteggio massimo raggiunge puntiSet-1', () => {
    render(<ScoreControl regole={r} setIniziali={[]} onSalva={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Punteggio squadra A, set 1'), { target: { value: '20' } })
    const setEl = screen.getByText('Set 1').closest('.score-control-set')
    expect(setEl).toHaveClass('score-control-set-point')
  })

  it('parte dai set iniziali forniti', () => {
    render(<ScoreControl regole={r} setIniziali={[{ puntiA: 5, puntiB: 3 }]} onSalva={vi.fn()} />)
    expect(screen.getByLabelText('Punteggio squadra A, set 1')).toHaveValue(5)
    expect(screen.getByLabelText('Punteggio squadra B, set 1')).toHaveValue(3)
  })
})
