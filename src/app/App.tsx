import { Routes, Route } from 'react-router-dom'
import { AppShell } from './AppShell'
import { HomeScreen } from '../screens/HomeScreen'
import { RiepilogoScreen } from '../screens/RiepilogoScreen'
import { SetupScreen } from '../screens/SetupScreen'
import { TeamsScreen } from '../screens/TeamsScreen'
import { BracketScreen } from '../screens/BracketScreen'
import { StandingsScreen } from '../screens/StandingsScreen'
import { RegistrationsAdminScreen } from '../screens/RegistrationsAdminScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { RegistrationScreen } from '../screens/RegistrationScreen'

export default function App() {
  return (
    <Routes>
      <Route path="/iscrizione/:codice" element={<RegistrationScreen />} />
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="tornei/nuovo" element={<SetupScreen />} />
        <Route path="tornei/:id" element={<RiepilogoScreen />} />
        <Route path="tornei/:id/setup" element={<SetupScreen />} />
        <Route path="tornei/:id/squadre" element={<TeamsScreen />} />
        <Route path="tornei/:id/tabellone" element={<BracketScreen />} />
        <Route path="tornei/:id/classifiche" element={<StandingsScreen />} />
        <Route path="tornei/:id/iscrizioni" element={<RegistrationsAdminScreen />} />
        <Route path="impostazioni" element={<SettingsScreen />} />
      </Route>
    </Routes>
  )
}
