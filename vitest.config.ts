import { defineConfig, configDefaults } from 'vitest/config'

// I pochi .test.ts che usano globali del browser (localStorage/document/…):
// vanno tenuti in jsdom insieme ai componenti .test.tsx.
const browserTs = [
  'src/services/auth.test.ts',
  'src/services/config.test.ts',
  'src/services/orgSync.test.ts',
  'src/services/orgSync.debounce.test.ts',
  'src/services/verifica.test.ts',
  'src/styles/tokens.test.ts',
]

// Contesto: repo su /mnt/c (FS Windows in WSL) → leggere il runtime di Vitest e
// jsdom da quel filesystem è lento. Col pool "threads" di default (isolate:true),
// Vitest ri-bootava un worker per ogni file e i boot andavano in "Timeout waiting
// for worker to respond", scartando file in modo non deterministico (conteggi che
// oscillavano). Soluzione applicata sotto, DIVERSA per progetto. NB: con
// `projects` queste opzioni vanno messe per-progetto (al root NON si propagano:
// i progetti userebbero i default).
const timeouts = { testTimeout: 20000, hookTimeout: 30000 }
// node: ambiente leggero e veloce da bootare → il pool "threads" va bene (2
// thread; mai 1, per non far condividere un contesto a tutti i file).
const nodeRuntime = { ...timeouts, pool: 'threads' as const, poolOptions: { threads: { minThreads: 2, maxThreads: 2 } } }
// dom: "vmThreads" → il worker (thread) NON viene ri-bootato per file (niente
// più timeout di avvio ripetuti), ma ogni file gira in un contesto VM FRESCO,
// quindi resta isolato (niente leakage come con isolate:false). jsdom viene
// costruito una volta e riusato tra i contesti.
const domRuntime = { ...timeouts, pool: 'vmThreads' as const, poolOptions: { vmThreads: { minThreads: 1, maxThreads: 2 } } }

export default defineConfig({
  test: {
    projects: [
      {
        // Pura logica (engine/db/services/worker) → ambiente node: avvio quasi
        // istantaneo, niente costo jsdom (il collo di bottiglia su /mnt/c).
        test: {
          name: 'node',
          environment: 'node',
          setupFiles: ['src/db/test-setup.ts'],
          include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...browserTs],
          ...nodeRuntime,
        },
      },
      {
        // React (componenti/schermate) + i pochi .test.ts con globali browser.
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['src/db/test-setup.ts', 'src/test/setup-dom.ts'],
          include: ['src/**/*.test.tsx', ...browserTs],
          ...domRuntime,
        },
      },
    ],
  },
})
