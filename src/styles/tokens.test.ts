/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'

describe('tokens.css', () => {
  it('definisce i token di colore richiesti', () => {
    // jsdom's global URL constructor does not honor a `file:` base URL
    // (it resolves relative to the jsdom document location instead), so we
    // must use Node's own URL explicitly here.
    const css = readFileSync(new NodeURL('./tokens.css', import.meta.url), 'utf8')
    for (const t of ['--paper', '--surface', '--ink', '--muted', '--line', '--sea', '--sand', '--win', '--danger']) {
      expect(css).toContain(t)
    }
  })
})
