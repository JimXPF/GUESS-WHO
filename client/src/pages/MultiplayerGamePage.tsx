import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSession, SESSION_KEY, ROOM_KEY } from '../api';
import { useGameRoom } from '../hooks/useGameRoom';
import GuessRow from '../components/GuessRow';
import GuessInput from '../components/GuessInput';
import HintCard from '../components/HintCard';
import PlayerProgressBar from '../components/PlayerProgressBar';
import { GameSession, THEME_LABELS } from '../types';

export default function MultiplayerGamePage() {
  const navigate = useNavigate();
  const { room, submitRoomGuess, leaveRoom } = useGameRoom();
  const [session, setSession] = useState<GameSession | null>(null);
  const [guessText, setGuessText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const sessionId = localStorage.getItem(SESSION_KEY) || '';
  const roomCode = localStorage.getItem(ROOM_KEY) || '';

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      navigate('/');
      return;
    }
    try {
      const s = await getSession(sessionId);
      setSession(s);
    } catch {
      navigate('/');
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (room?.status === 'finished') {
      navigate('/settlement');
    }
  }, [room?.status, navigate]);

  useEffect(() => {
    if (room) loadSession();
  }, [room?.players, loadSession]);

  const handleGuess = async (text?: string, characterId?: string) => {
    const guess = (text ?? guessText).trim();
    if (!session || !guess || loading || !roomCode) return;
    if (room?.mode === 'relay-chain' && room.currentTurnSessionId !== sessionId) {
      setError('还没轮到你作答');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await submitRoomGuess(roomCode, sessionId, guess, characterId);
      if (result.error) {
        setError(result.error);
      } else if (result.notInBank) {
        setToast(result.message || '题库中没有该角色');
        setTimeout(() => setToast(''), 3000);
      } else if (result.session) {
        setSession(result.session);
        setGuessText('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuit = () => {
    leaveRoom(sessionId);
    navigate('/settlement');
  };

  if (!session || !room) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <p className="text-apple-gray">加载中...</p>
      </div>
    );
  }

  const isRelay = room.mode === 'relay-chain';
  const isMyTurn = !isRelay || room.currentTurnSessionId === sessionId;
  const currentGuesses = session.guesses.filter((g) => g.fieldResults !== null);
  const inputDisabled = session.attemptsLeft <= 0 || !isMyTurn;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <PlayerProgressBar
        players={room.players}
        mySessionId={sessionId}
        mode={room.mode}
        currentTurnPlayer={room.currentTurnPlayer}
      />

      <header className="shrink-0 z-40 bg-apple-bg/90 backdrop-blur-xl border-b border-gray-200/50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold">{room.code}</span>
          <h1 className="text-lg font-bold">{THEME_LABELS[session.theme]}</h1>
          <button className="text-sm text-apple-red" onClick={handleQuit}>
            退出
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-3xl mx-auto w-full px-4 py-3 flex flex-col overflow-hidden">
        <div className="shrink-0 mb-2">
          <HintCard hints={session.hints ?? [session.hint]} />
          {toast && (
            <div className="bg-apple-orange/10 text-apple-orange rounded-lg px-3 py-1.5 text-xs text-center mt-2">
              {toast}
            </div>
          )}
          {error && (
            <div className="bg-apple-red/10 text-apple-red rounded-lg px-3 py-1.5 text-xs text-center mt-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {currentGuesses.map((guess, i) => (
            <GuessRow
              key={guess.id}
              guessName={guess.guessName}
              imageUrl={guess.imageUrl}
              fieldResults={guess.fieldResults!}
              isCorrect={guess.isCorrect}
              index={i}
            />
          ))}
        </div>

        <div className="shrink-0 glass-card p-3 flex gap-3 mt-2">
          <GuessInput
            theme={session.theme}
            value={guessText}
            placeholder={session.guessPlaceholder || '输入猜测...'}
            onChange={setGuessText}
            onSubmit={handleGuess}
            disabled={inputDisabled}
            loading={loading}
            suggestionsPlacement="top"
          />
          <button
            className="btn-primary shrink-0 px-6"
            onClick={() => handleGuess()}
            disabled={loading || !guessText.trim() || inputDisabled}
          >
            猜测
          </button>
        </div>
      </main>
    </div>
  );
}
