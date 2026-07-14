import { createServer } from 'node:http'
import { handle } from './src/handler.ts'
import { fakeKV } from './src/fake-kv.ts'

// Nota: eseguire con un runner che supporta TS (es. `node --experimental-strip-types`
// su Node 22+, oppure `npx tsx worker/mock-server.mjs`). Vedi lo script npm.
const env = { KV: fakeKV(), READ_TOKEN: process.env.READ_TOKEN || 'dev-token' }

const server = createServer(async (nreq, nres) => {
  const chunks = []
  for await (const c of nreq) chunks.push(c)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const url = 'http://localhost:8787' + nreq.url
  const request = new Request(url, {
    method: nreq.method,
    headers: nreq.headers,
    body: ['GET', 'HEAD'].includes(nreq.method) ? undefined : body,
  })
  const res = await handle(request, env)
  nres.statusCode = res.status
  res.headers.forEach((v, k) => nres.setHeader(k, v))
  const buf = Buffer.from(await res.arrayBuffer())
  nres.end(buf)
})

server.listen(8787, () => console.log('Mock API iscrizioni su http://localhost:8787 (token: dev-token)'))
