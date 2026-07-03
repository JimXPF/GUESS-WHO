package services

import "guess-who/server-go/internal/types"

// RelayTurnRoom 是推进接龙回合所需的最小房间结构。
type RelayTurnRoom struct {
	PlayerOrder        []string
	RelayTurnSessionID *string
	Players            map[string]*RelayTurnPlayer
	RelayNoticeSeq     int
}

// RelayTurnPlayer 保存接龙通知所需的玩家名。
type RelayTurnPlayer struct {
	PlayerName string
}

// IsRelayPlayerActive 判断会话是否仍可参与接龙回合。
func IsRelayPlayerActive(sessionID string) bool {
	row, err := getSessionRow(sessionID)
	if err != nil || row == nil {
		return false
	}
	return row.AttemptsLeft > 0 && row.Status != types.StatusGameOver
}

// AdvanceRelayTurn 将回合移交给下一位符合条件的玩家；可能发出通知。
func AdvanceRelayTurn(room *RelayTurnRoom, fromSessionID string) *types.RelayNotice {
	eligible := []string{}
	for _, sid := range room.PlayerOrder {
		if IsRelayPlayerActive(sid) {
			eligible = append(eligible, sid)
		}
	}
	if len(eligible) == 0 {
		room.RelayTurnSessionID = nil
		return nil
	}

	order := room.PlayerOrder
	fromIdx := -1
	for i, sid := range order {
		if sid == fromSessionID {
			fromIdx = i
			break
		}
	}
	fromExhausted := fromIdx >= 0 && !IsRelayPlayerActive(fromSessionID)

	for step := 1; step <= len(order); step++ {
		idx := step - 1
		if fromIdx >= 0 {
			idx = (fromIdx + step) % len(order)
		}
		sid := order[idx]
		if !IsRelayPlayerActive(sid) {
			continue
		}
		room.RelayTurnSessionID = &sid

		if fromExhausted && len(eligible) == 1 && sid != fromSessionID {
			exhaustedName := "对方"
			if p, ok := room.Players[fromSessionID]; ok && p != nil {
				exhaustedName = p.PlayerName
			}
			room.RelayNoticeSeq++
			return &types.RelayNotice{
				ID:                  room.RelayNoticeSeq,
				TargetSessionID:     sid,
				ExhaustedPlayerName: exhaustedName,
			}
		}
		return nil
	}

	first := eligible[0]
	room.RelayTurnSessionID = &first
	return nil
}

// EnsureRelayTurnActive 若当前持有者已不活跃，则推进回合。
func EnsureRelayTurnActive(room *RelayTurnRoom) *types.RelayNotice {
	if room.RelayTurnSessionID == nil {
		return nil
	}
	if IsRelayPlayerActive(*room.RelayTurnSessionID) {
		return nil
	}
	return AdvanceRelayTurn(room, *room.RelayTurnSessionID)
}
