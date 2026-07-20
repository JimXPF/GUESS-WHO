import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';
import ResultPage from './pages/ResultPage';
import LeaderboardPage from './pages/LeaderboardPage';
import LobbyPage from './pages/LobbyPage';
import MultiplayerGamePage from './pages/MultiplayerGamePage';
import SettlementPage from './pages/SettlementPage';
import LobbyCountdown from './components/LobbyCountdown';
import { useGameRoom } from './hooks/useGameRoom';

/** 全局开局倒计时：房主/加入者任意页面都能看到 3-2-1 */
function GlobalLobbyCountdown() {
  const { room } = useGameRoom();
  if (room?.status !== 'countdown') return null;
  return (
    <LobbyCountdown
      deadlineAt={room.countdownDeadlineAt}
      seconds={room.lobbyCountdownSeconds ?? 3}
    />
  );
}

export default function App() {
  return (
    <>
      <GlobalLobbyCountdown />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/multiplayer" element={<MultiplayerGamePage />} />
        <Route path="/settlement" element={<SettlementPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
      </Routes>
    </>
  );
}
