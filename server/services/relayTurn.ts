import { getGameSession } from './gameService';

export interface RelayNotice {
  id: number;
  targetSessionId: string;
  exhaustedPlayerName: string;
}

export function isRelayPlayerActive(sessionId: string): boolean {
  const s = getGameSession(sessionId);
  return Boolean(s && s.attemptsLeft > 0 && s.status !== 'game_over');
}

export function advanceRelayTurn(
  room: {
    playerOrder: string[];
    relayTurnSessionId: string | null;
    players: Map<string, { playerName: string }>;
    relayNoticeSeq?: number;
  },
  fromSessionId: string
): RelayNotice | null {
  const eligible = room.playerOrder.filter(isRelayPlayerActive);
  if (eligible.length === 0) {
    room.relayTurnSessionId = null;
    return null;
  }

  const order = room.playerOrder;
  const fromIdx = order.indexOf(fromSessionId);
  const fromExhausted = fromIdx >= 0 && !isRelayPlayerActive(fromSessionId);

  for (let step = 1; step <= order.length; step++) {
    const idx = fromIdx >= 0 ? (fromIdx + step) % order.length : step - 1;
    const sid = order[idx];
    if (!isRelayPlayerActive(sid)) continue;

    room.relayTurnSessionId = sid;

    if (fromExhausted && eligible.length === 1 && sid !== fromSessionId) {
      const exhaustedName = room.players.get(fromSessionId)?.playerName ?? '对方';
      room.relayNoticeSeq = (room.relayNoticeSeq ?? 0) + 1;
      return {
        id: room.relayNoticeSeq,
        targetSessionId: sid,
        exhaustedPlayerName: exhaustedName,
      };
    }
    return null;
  }

  room.relayTurnSessionId = eligible[0];
  return null;
}

export function ensureRelayTurnActive(
  room: Parameters<typeof advanceRelayTurn>[0]
): RelayNotice | null {
  const current = room.relayTurnSessionId;
  if (!current || isRelayPlayerActive(current)) return null;
  return advanceRelayTurn(room, current);
}
