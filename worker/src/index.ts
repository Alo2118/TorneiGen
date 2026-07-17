import { handle, type Env } from './handler'
import { d1OrgStore, type D1Like } from './d1-org-store'
import { d1UserStore } from './d1-user-store'
import { d1SocietaStore } from './d1-societa-store'

interface CfEnv {
  KV: Env['KV']
  READ_TOKEN: string
  WRITE_TOKEN: string
  DB: D1Like
  AUTH_SECRET: string
  ADMIN_EMAIL: string
}

export default {
  fetch(request: Request, cfEnv: CfEnv): Promise<Response> {
    const env: Env = {
      KV: cfEnv.KV,
      READ_TOKEN: cfEnv.READ_TOKEN,
      WRITE_TOKEN: cfEnv.WRITE_TOKEN,
      ORG: d1OrgStore(cfEnv.DB),
      USERS: d1UserStore(cfEnv.DB),
      SOCIETA: d1SocietaStore(cfEnv.DB),
      AUTH_SECRET: cfEnv.AUTH_SECRET,
      ADMIN_EMAIL: cfEnv.ADMIN_EMAIL,
    }
    return handle(request, env)
  },
}
