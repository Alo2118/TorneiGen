import { handle, type Env } from './handler'
import { d1OrgStore, type D1Like } from './d1-org-store'

interface CfEnv {
  KV: Env['KV']
  READ_TOKEN: string
  WRITE_TOKEN: string
  DB: D1Like
}

export default {
  fetch(request: Request, cfEnv: CfEnv): Promise<Response> {
    const env: Env = {
      KV: cfEnv.KV,
      READ_TOKEN: cfEnv.READ_TOKEN,
      WRITE_TOKEN: cfEnv.WRITE_TOKEN,
      ORG: d1OrgStore(cfEnv.DB),
    }
    return handle(request, env)
  },
}
