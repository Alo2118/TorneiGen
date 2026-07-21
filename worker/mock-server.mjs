import { createServer } from 'node:http'
import { handle } from './src/handler.ts'
import { fakeKV } from './src/fake-kv.ts'
import { fakeOrgStore } from './src/fake-org-store.ts'
import { fakeUserStore } from './src/fake-user-store.ts'
import { fakeSocietaStore } from './src/fake-societa-store.ts'

// Nota: eseguire con un runner che supporta TS (es. `node --experimental-strip-types`
// su Node 22+, oppure `npx tsx worker/mock-server.mjs`). Vedi lo script npm.
const env = {
  KV: fakeKV(),
  WRITE_TOKEN: process.env.WRITE_TOKEN || 'dev-write',
  ORG: fakeOrgStore(),
  USERS: fakeUserStore(),
  SOCIETA: fakeSocietaStore(),
  AUTH_SECRET: process.env.AUTH_SECRET || 'dev-secret',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@dev',
}

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

server.listen(8787, () => console.log('Mock API iscrizioni su http://localhost:8787 (write token: dev-write)'))
