import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';
import ResultPage from './pages/ResultPage';
import LeaderboardPage from './pages/LeaderboardPage';
import LobbyPage from './pages/LobbyPage';
import MultiplayerGamePage from './pages/MultiplayerGamePage';
import SettlementPage from './pages/SettlementPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/game" element={<GamePage />} />
      <Route path="/lobby" element={<LobbyPage />} />
      <Route path="/multiplayer" element={<MultiplayerGamePage />} />
      <Route path="/settlement" element={<SettlementPage />} />
      <Route path="/result" element={<ResultPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
    </Routes>
  );
}
