import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSession, SESSION_KEY, ROOM_KEY } from '../api';
import { useGameRoom } from '../hooks/useGameRoom';
import GuessRow from '../components/GuessRow';
import GuessInput from '../components/GuessInput';
import HintCard from '../components/HintCard';
import PlayerProgressBar from '../components/PlayerProgressBar';
import RelayTurnCountdown from '../components/RelayTurnCountdown';
import RelayCorrectHistory from '../components/RelayCorrectHistory';
import BattleRoundBanner from '../components/BattleRoundBanner';
import BattleNextCountdown from '../components/BattleNextCountdown';
import CorrectHistory from '../components/CorrectHistory';
import RelayOpponentExhaustedModal from '../components/RelayOpponentExhaustedModal';
import AnswerRevealModal from '../components/AnswerRevealModal';
import { AttemptsBadge } from '../components/StatSidebar';
import type { GameSession, GuessRecord, RelayGuessRecord } from '../types';
import {
  RELAY_FIELD_POINTS,
  RELAY_FULL_CORRECT_MIN,
  RELAY_TIMEOUT_PENALTY,
  RELAY_WRONG_CLAIM_PENALTY,
  FULL_CORRECT_MIN_SCORE,
  BATTLE_PARTIAL_POINTS_PER_HIT,
  BATTLE_QUESTION_COUNT,
  THEME_LABELS,
} from '../types';

export default function MultiplayerGamePage() {
  const navigate = useNavigate();
  const { room, submitRoomGuess, leaveRoom, rejoinRoom, advanceIntermission } = useGameRoom();
  const [session, setSession] = useState<GameSession | null>(null);
  const [guessText, setGuessText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [relayNoticeOpen, setRelayNoticeOpen] = useState(false);
  const [relayNoticeName, setRelayNoticeName] = useState('');
  const [seenRelayNoticeId, setSeenRelayNoticeId] = useState(0);
  const [showDrawReveal, setShowDrawReveal] = useState(false);
  const [drawAnswer, setDrawAnswer] = useState<{
    name: string;
    imageUrl: string | null;
  } | null>(null);
  const [wentToSettlement, setWentToSettlement] = useState(false);
  const sessionId = localStorage.getItem(SESSION_KEY) || '';
  const roomCode = localStorage.getItem(ROOM_KEY) || '';

  // All hooks must run unconditionally before any early return (React #310).
  const handleIntermissionExpired = useCallback(() => {
    if (!roomCode || !sessionId) return;
    void advanceIntermission(roomCode, sessionId).finally(() => {
      window.setTimeout(() => {
        rejoinRoom(roomCode, sessionId);
      }, 300);
    });
  }, [roomCode, sessionId, rejoinRoom, advanceIntermission]);

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
    if (!room && sessionId && roomCode) {
      rejoinRoom(roomCode, sessionId);
    }
  }, [room, sessionId, roomCode, rejoinRoom]);

  useEffect(() => {
    if (room?.status !== 'finished' || wentToSettlement) return;
    setWentToSettlement(true);
    sessionStorage.setItem('guess-who-last-room', JSON.stringify(room));
    navigate('/settlement', { replace: true });
  }, [room, wentToSettlement, navigate]);

  useEffect(() => {
    if (room?.battlePhase !== 'intermission' || room.battleResult?.kind !== 'draw') {
      setShowDrawReveal(false);
      setDrawAnswer(null);
      return;
    }
    setDrawAnswer({
      name: room.battleResult.answerName,
      imageUrl: room.battleResult.answerImageUrl ?? null,
    });
    setShowDrawReveal(true);
  }, [room?.battlePhase, room?.battleResult]);

  useEffect(() => {
    const notice = room?.relayNotice;
    if (!notice || room.mode !== 'relay-chain') return;
    if (notice.id <= seenRelayNoticeId) return;
    if (notice.targetSessionId !== sessionId) return;
    setRelayNoticeName(notice.exhaustedPlayerName);
    setRelayNoticeOpen(true);
    setSeenRelayNoticeId(notice.id);
  }, [room?.relayNotice, room?.mode, sessionId, seenRelayNoticeId]);

  useEffect(() => {
    if (room) loadSession();
  }, [room?.relayRound, room?.players, room?.battlePhase, room?.relayPhase, room?.currentQuestionIndex, loadSession, room]);

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

  const handleQuit = async () => {
    const result = await leaveRoom(sessionId);
    const settlementRoom = result.room ?? room;
    if (settlementRoom) {
      sessionStorage.setItem('guess-who-last-room', JSON.stringify(settlementRoom));
    }
    navigate('/settlement', { replace: true });
  };

  if (!session || !room) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <p className="text-apple-gray">加载中...</p>
      </div>
    );
  }

  const isRelay = room.mode === 'relay-chain';
  const isBattle = room.mode === 'battle';
  const isBattleIntermission = isBattle && room.battlePhase === 'intermission';
  const isRelayIntermission = isRelay && room.relayPhase === 'intermission';
  const isIntermission = isBattleIntermission || isRelayIntermission;
  const roundResult =
    (isBattleIntermission ? room.battleResult : null) ||
    (isRelayIntermission ? room.relayRoundResult : null);
  const myPlayer = room.players.find((p) => p.sessionId === sessionId);
  const myAttemptsLeft = myPlayer?.attemptsLeft ?? session.attemptsLeft;
  const isMyTurn =
    !isRelay ||
    (room.currentTurnSessionId === sessionId && myAttemptsLeft > 0);
  const battleGuesses = session.guesses.filter((g) => {
    if (g.fieldResults === null) return false;
    const qIdx =
      isIntermission && roundResult
        ? roundResult.questionIndex
        : session.questionIndex;
    return g.questionIndex === qIdx;
  });
  const relayGuesses: RelayGuessRecord[] = room.relayGuesses ?? [];
  const displayGuesses: Array<GuessRecord & { playerName?: string; sessionId?: string }> =
    isRelay ? relayGuesses : battleGuesses;
  const inputDisabled =
    myAttemptsLeft <= 0 || !isMyTurn || isIntermission;
  const turnPlayerName = room.currentTurnPlayer || '其他玩家';

  const emptyHint = isIntermission
    ? '本题已结束，请等待下一题'
    : isRelay
      ? isMyTurn
        ? '输入名字开始猜测'
        : `等待 ${turnPlayerName} 作答`
      : '输入名字开始猜测';

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <header className="shrink-0 z-40 bg-apple-bg/90 backdrop-blur-xl border-b border-gray-200/50 safe-top">
        <div className="max-w-[1520px] mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-apple-gray truncate">{room.code}</span>
          <h1 className="text-base sm:text-lg font-bold tracking-wide shrink-0">
            {THEME_LABELS[session.theme]}
            {isBattle && (
              <span className="block text-xs font-normal text-apple-gray text-center">
                对战 · 第 {(room.currentQuestionIndex ?? 0) + 1} / {room.battleTotalQuestions ?? BATTLE_QUESTION_COUNT} 题
              </span>
            )}
            {isRelay && (
              <span className="block text-xs font-normal text-apple-gray text-center">
                接龙 · 第 {room.relayRound ?? 1} 轮
              </span>
            )}
          </h1>
          <button type="button" className="text-sm text-apple-red shrink-0" onClick={handleQuit}>
            退出
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 max-w-[1520px] mx-auto w-full px-3 sm:px-4 py-2 sm:py-3 grid grid-cols-1 lg:grid-cols-[200px_1fr_220px] gap-3 lg:gap-4 overflow-hidden">
        <aside className="hidden lg:flex lg:flex-col min-h-0 shrink-0 overflow-hidden order-2 lg:order-1">
          <PlayerProgressBar
            players={room.players}
            mySessionId={sessionId}
            mode={room.mode}
            currentTurnSessionId={room.currentTurnSessionId}
            currentTurnPlayer={room.currentTurnPlayer}
            maxAttemptsPerQuestion={session.maxAttempts ?? 10}
          />
        </aside>

        <main className="flex flex-col min-h-0 min-w-0 overflow-hidden order-1 lg:order-2">
          <div className="lg:hidden shrink-0 mb-2 space-y-2">
            <PlayerProgressBar
              players={room.players}
              mySessionId={sessionId}
              mode={room.mode}
              currentTurnSessionId={room.currentTurnSessionId}
              currentTurnPlayer={room.currentTurnPlayer}
              maxAttemptsPerQuestion={session.maxAttempts ?? 10}
            />
            {isRelay && !isRelayIntermission && (
              <RelayTurnCountdown
                deadlineAt={room.turnDeadlineAt}
                turnSeconds={room.relayTurnSeconds ?? 30}
                currentTurnPlayer={room.currentTurnPlayer}
                isMyTurn={isMyTurn}
              />
            )}
          </div>

          <div className="shrink-0 mb-2 space-y-2">
            {isIntermission && roundResult && (
              <BattleRoundBanner result={roundResult} mySessionId={sessionId} />
            )}
            {!isIntermission && (
              <HintCard hints={isRelay && room.relayHints ? room.relayHints : session.hints} />
            )}
            {isBattle && !isIntermission && (
              <p className="text-[11px] text-apple-gray text-center leading-relaxed">
                对战：固定 {BATTLE_QUESTION_COUNT} 题，每题各 {session.maxAttempts ?? 10} 次机会；
                先猜对得本题高分（最低 {FULL_CORRECT_MIN_SCORE} 分），平局按字段命中加分（每项 +{BATTLE_PARTIAL_POINTS_PER_HIT}）
              </p>
            )}
            {isRelay && (
              <p className="text-[11px] text-apple-gray text-center mt-2 leading-relaxed">
                接龙计分：字段首次认领 +{RELAY_FIELD_POINTS}，已被认领字段再猜对不加分，
                已认领字段答错 -{RELAY_WRONG_CLAIM_PENALTY}，完全猜对 300/270/230/180/120/
                {RELAY_FULL_CORRECT_MIN}（按已认领数），超时 -{RELAY_TIMEOUT_PENALTY}
              </p>
            )}
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

          <div className="flex-1 min-h-0 overflow-hidden relative">
            <div className="absolute inset-0 overflow-y-auto overflow-x-hidden space-y-2 overscroll-contain [scrollbar-gutter:stable]">
            {displayGuesses.length === 0 ? (
              <div className="glass-card p-6 sm:p-8 text-center text-apple-gray">
                <p className="font-medium">还没有猜测记录</p>
                <p className="text-sm mt-1">{emptyHint}</p>
              </div>
            ) : (
              displayGuesses.map((guess, i) => (
                <GuessRow
                  key={`${guess.sessionId ?? 'self'}-${guess.id}`}
                  guessName={guess.guessName}
                  imageUrl={guess.imageUrl}
                  fieldResults={guess.fieldResults!}
                  isCorrect={guess.isCorrect}
                  index={i}
                  playerName={guess.playerName}
                  isActivePlayer={
                    isRelay && guess.sessionId === room.currentTurnSessionId
                  }
                  scoreDelta={guess.scoreDelta}
                  showRelayScoring={isRelay}
                />
              ))
            )}
            </div>
          </div>

          {isIntermission ? (
            <div className="relative z-30 shrink-0 pt-2 bg-apple-bg/95 backdrop-blur-md border-t border-gray-200/50">
            <BattleNextCountdown
              deadlineAt={room.intermissionDeadlineAt}
              seconds={room.battleIntermissionSeconds ?? 5}
              onExpired={handleIntermissionExpired}
            />
            </div>
          ) : isRelay && !isMyTurn ? (
            <div className="relative z-30 shrink-0 pt-2 bg-apple-bg/95 backdrop-blur-md border-t border-gray-200/50">
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/90 px-4 py-4 text-center shadow-md shadow-blue-100/60">
              <p className="text-base font-semibold text-apple-blue">
                {myAttemptsLeft <= 0
                  ? '你的机会已用尽，等待对方作答'
                  : `现在轮到 ${turnPlayerName} 作答`}
              </p>
              <p className="text-xs text-apple-gray mt-1">
                {myAttemptsLeft <= 0
                  ? '请查看上方猜测记录'
                  : '请查看上方猜测记录，等待轮到你'}
              </p>
            </div>
            </div>
          ) : myAttemptsLeft > 0 ? (
            <div className="relative z-30 shrink-0 pt-2 bg-apple-bg/95 backdrop-blur-md border-t border-gray-200/50">
            <div className="glass-card p-3 flex gap-3 overflow-visible">
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
            </div>
          ) : null}
        </main>

        <aside className="hidden lg:flex lg:flex-col gap-3 shrink-0 order-3 overflow-hidden min-h-0">
          {isRelay && !isRelayIntermission && (
            <RelayTurnCountdown
              deadlineAt={room.turnDeadlineAt}
              turnSeconds={room.relayTurnSeconds ?? 30}
              currentTurnPlayer={room.currentTurnPlayer}
              isMyTurn={isMyTurn}
            />
          )}
          <AttemptsBadge
            attemptsLeft={myAttemptsLeft}
            maxAttempts={session.maxAttempts ?? 10}
          />
          <div className="glass-card p-4 flex flex-col min-h-0 flex-1 overflow-hidden">
            {isRelay ? (
              <RelayCorrectHistory records={room.relayCorrectHistory ?? []} />
            ) : (
              <CorrectHistory answers={session.correctAnswers ?? []} />
            )}
          </div>
        </aside>
      </div>

      <RelayOpponentExhaustedModal
        open={relayNoticeOpen}
        exhaustedPlayerName={relayNoticeName}
        onClose={() => setRelayNoticeOpen(false)}
      />

      <AnswerRevealModal
        open={showDrawReveal}
        variant="failure"
        answerName={drawAnswer?.name ?? '—'}
        answerImageUrl={drawAnswer?.imageUrl}
        continueLabel="继续"
        onContinue={() => setShowDrawReveal(false)}
      />
    </div>
  );
}
