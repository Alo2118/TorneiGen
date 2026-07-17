import { Button } from './Button'
import type { OrgSync } from '../services/useOrgSync'

export function ConflittoOrgBanner({ sync }: { sync: OrgSync }) {
  if (!sync.conflitto) return null
  return (
    <div className="org-conflitto" role="alert">
      <p className="org-conflitto-testo">
        L'organizzazione è cambiata su un altro dispositivo. Le tue ultime modifiche non sono ancora nel cloud.
      </p>
      <div className="org-conflitto-azioni">
        <Button variant="ghost" onClick={() => void sync.risolviCloud()}>
          Usa quelle dal cloud
        </Button>
        <Button onClick={() => void sync.risolviLocale()}>Sovrascrivi con le mie</Button>
      </div>
    </div>
  )
}
