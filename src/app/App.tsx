import { Routes, Route } from 'react-router-dom'
import { AppShell } from './AppShell'
import { HomeScreen } from '../screens/HomeScreen'
import { SetupScreen } from '../screens/SetupScreen'
import { TeamsScreen } from '../screens/TeamsScreen'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="tornei/nuovo" element={<SetupScreen />} />
        <Route path="tornei/:id/setup" element={<SetupScreen />} />
        <Route path="tornei/:id/squadre" element={<TeamsScreen />} />
        {/* altre rotte /tornei/* aggiunte nei task successivi */}
      </Route>
    </Routes>
  )
}
