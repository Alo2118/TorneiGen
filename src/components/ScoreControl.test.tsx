import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScoreControl } from './ScoreControl'
import type { RegolePunteggio } from '../engine/types'

const r: RegolePunteggio = { setAlMeglioDi: 1, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }
const r3: RegolePunteggio = { setAlMeglioDi: 3, puntiSet: 21, puntiTieBreak: 15, vittoriaConDue: true }

describe('ScoreControl', () => {
  it('inserisce un punteggio con gli stepper e chiama onSalva', async () => {
    const onSalva = vi.fn()
    render(<ScoreControl regole={r} setIniziali={[]} onSalva={onSalva} />)

    const piuA = screen.getByRole('button', { name: /aumenta punteggio squadra a, set 1/i })
    for (let i = 0; i < 21; i++) fireEvent.click(piuA)
    const piuB = screen.getByRole('button', { name: /aumenta punteggio squadra b, set 1/i })
    for (let i = 0; i < 15; i++) fireEvent.click(piuB)

    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /salva/i }))
    expect(onSalva).toHaveBeenCalledWith([{ puntiA: 21, puntiB: 15 }])
  })

  it('lo stepper meno resta disabilitato a zero', () => {
    render(<ScoreControl regole={r} setIniziali={[]} onSalva={vi.fn()} />)
    const menoA = screen.getByRole('button', { name: /diminuisci punteggio squadra a, set 1/i })
    expect(menoA).toBeDisabled()
  })

  it('marca il set attivo con la classe sea e nessun set point sotto soglia', () => {
    render(<ScoreControl regole={r} setIniziali={[]} onSalva={vi.fn()} />)
    const setEl = screen.getByText('Set 1').closest('.score-control-set')
    expect(setEl).toHaveClass('score-control-set-active')
    expect(setEl).not.toHaveClass('score-control-set-point')
  })

  it('evidenzia il set point quando il punteggio massimo raggiunge puntiSet-1', () => {
    render(<ScoreControl regole={r} setIniziali={[]} onSalva={vi.fn()} />)
    const piuA = screen.getByRole('button', { name: /aumenta punteggio squadra a, set 1/i })
    for (let i = 0; i < 20; i++) fireEvent.click(piuA)
    const setEl = screen.getByText('Set 1').closest('.score-control-set')
    expect(setEl).toHaveClass('score-control-set-point')
  })

  it('rivela il set successivo quando il primo set è concluso (al meglio dei 3)', () => {
    render(<ScoreControl regole={r3} setIniziali={[]} onSalva={vi.fn()} />)
    expect(screen.queryByText('Set 2')).not.toBeInTheDocument()
    const piuA = screen.getByRole('button', { name: /aumenta punteggio squadra a, set 1/i })
    for (let i = 0; i < 21; i++) fireEvent.click(piuA)
    expect(screen.getByText('Set 2')).toBeInTheDocument()
  })

  it('parte dai set iniziali forniti', () => {
    render(<ScoreControl regole={r} setIniziali={[{ puntiA: 5, puntiB: 3 }]} onSalva={vi.fn()} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
