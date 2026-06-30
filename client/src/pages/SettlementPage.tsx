import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { RoomState, THEME_LABELS } from '../types';

export default function SettlementPage() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('guess-who-last-room');
    if (raw) {
      try {
        setRoom(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
    localStorage.removeItem('guess-who-session-id');
    localStorage.removeItem('guess-who-room-code');
  }, []);

  const sorted = [...(room?.players ?? [])].sort((a, b) => b.score - a.score);

  const handleShareHint = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-[100dvh] p-6 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-card p-6 settlement-card"
        id="settlement-card"
      >
        <h1 className="text-2xl font-bold text-center mb-1">本局结算</h1>
        {room?.finishReason && (
          <p className="text-sm text-apple-gray text-center mb-4">{room.finishReason}</p>
        )}

        <div className="space-y-2 mb-6">
          {sorted.map((p, i) => (
            <div
              key={p.sessionId}
              className="flex items-center justify-between py-3 px-4 rounded-xl bg-gray-50/80"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-apple-gray w-6">{i + 1}</span>
                <div>
                  <p className="font-medium">{p.playerName}</p>
                  <p className="text-xs text-apple-gray">
                    答对 {p.correctCount} · 剩余 {p.attemptsLeft} 次
                  </p>
                </div>
              </div>
              <span className="text-xl font-bold text-apple-blue">{p.score}</span>
            </div>
          ))}
        </div>

        {room && (
          <p className="text-xs text-center text-apple-gray mb-4">
            {THEME_LABELS[room.theme]} · 房间 {room.code}
          </p>
        )}

        <p className="text-xs text-center text-apple-gray mb-4">
          可截图分享本页（无排行榜记录）
        </p>

        <button type="button" className="btn-secondary w-full mb-3" onClick={handleShareHint}>
          {copied ? '请使用系统截图' : '截图分享'}
        </button>

        <Link to="/" className="btn-primary w-full block text-center">
          返回首页
        </Link>
      </motion.div>
    </div>
  );
}
