import type { KV } from './handler'

export function fakeKV(seed?: Record<string, string>): KV {
  const m = new Map<string, string>(Object.entries(seed ?? {}))
  return {
    async get(key) {
      return m.has(key) ? (m.get(key) as string) : null
    },
    async put(key, value) {
      m.set(key, value)
    },
    async delete(key) {
      m.delete(key)
    },
    async list({ prefix }) {
      return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }
    },
  }
}
