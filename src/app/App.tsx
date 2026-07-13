import { Routes, Route } from 'react-router-dom'
import { AppShell } from './AppShell'
import { HomeScreen } from '../screens/HomeScreen'
import { SetupScreen } from '../screens/SetupScreen'
import { TeamsScreen } from '../screens/TeamsScreen'
import { BracketScreen } from '../screens/BracketScreen'
import { StandingsScreen } from '../screens/StandingsScreen'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="tornei/nuovo" element={<SetupScreen />} />
        <Route path="tornei/:id/setup" element={<SetupScreen />} />
        <Route path="tornei/:id/squadre" element={<TeamsScreen />} />
        <Route path="tornei/:id/tabellone" element={<BracketScreen />} />
        <Route path="tornei/:id/classifiche" element={<StandingsScreen />} />
      </Route>
    </Routes>
  )
}
