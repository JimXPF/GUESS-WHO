package socket

import (
	"math/rand"
	"strings"
	"sync"
	"time"

	"guess-who/server-go/internal/services"
	"guess-who/server-go/internal/types"

	socketio "github.com/zishang520/socket.io/servers/socket/v3"
)

const (
	roomCodeChars       = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	questionQueueSize   = 30
)

// RoomPlayerEntry 跟踪房间中的单个玩家。
type RoomPlayerEntry struct {
	SessionID      string
	PlayerName     string
	SocketID       *string
	ScoreBreakdown []types.FieldClaim
}

// Room 是内存中的多人房间状态。
type Room struct {
	Code                       string
	Mode                       string
	Theme                      types.Theme
	MaxPlayers                 int
	Status                     string
	HostSessionID              string
	QuestionQueue              []types.QuestionSetup
	CurrentQuestionIndex       int
	Players                    map[string]*RoomPlayerEntry
	RelayTurnSessionID         *string
	RelayFieldClaims           services.RelayFieldClaims
	RelayRound                 int
	FinishReason               string
	PlayerOrder                []string
	RelayTurnStartedAt         *int64
	RelayTurnEpoch             int
	RelayTurnTimer             *time.Timer
	BattlePhase                string
	BattleResult               *types.BattleRoundResult
	IntermissionDeadlineAt     *int64
	BattleIntermissionTimer    *time.Timer
	RelayPhase                 string
	RelayRoundResult           *types.BattleRoundResult
	RelayIntermissionTimer     *time.Timer
	RelayIntermissionWinnerID  *string
	RelayNotice                *types.RelayNotice
	RelayNoticeSeq             int
	RevealedAnswer             *types.RevealedAnswer
	mu                         sync.Mutex
}

var (
	rooms        = map[string]*Room{}
	socketToRoom = map[string]string{}
	registryMu   sync.RWMutex
)

func generateRoomCode() string {
	b := make([]byte, 6)
	for i := range b {
		b[i] = roomCodeChars[rand.Intn(len(roomCodeChars))]
	}
	code := string(b)
	if _, ok := rooms[code]; ok {
		return generateRoomCode()
	}
	return code
}

// GetRoom 按房间码返回房间（不区分大小写）。
func GetRoom(code string) *Room {
	registryMu.RLock()
	defer registryMu.RUnlock()
	return rooms[strings.ToUpper(strings.TrimSpace(code))]
}

// RegisterRoomHandlers 注册 Socket.io 房间事件。
func RegisterRoomHandlers(io *socketio.Server) {
	io.On("connection", func(clients ...any) {
		s := clients[0].(*socketio.Socket)
		registerSocketHandlers(io, s)
	})
}

func registerSocketHandlers(io *socketio.Server, s *socketio.Socket) {
	onEvent(s, "room:create", func(payload map[string]any, ack socketio.Ack) {
		defer recoverAck(ack)
		playerName := strField(payload, "playerName")
		theme := types.Theme(strField(payload, "theme"))
		mode := strField(payload, "mode")
		maxPlayers := intField(payload, "maxPlayers", 2)

		if playerName == "" || theme == "" || mode == "" {
			ackAck(ack, types.RoomJoinResponse{Error: "缺少参数"})
			return
		}
		cap := maxPlayers
		if cap < 2 {
			cap = 2
		}
		if cap > 5 {
			cap = 5
		}

		gameMode := types.GameMode(mode)
		code := generateRoomCode()
		session, err := services.CreateBattleSession(playerName, theme, gameMode, code)
		if err != nil {
			ackAck(ack, types.RoomJoinResponse{Error: err.Error()})
			return
		}

		socketID := string(s.Id())
		room := &Room{
			Code:           code,
			Mode:           mode,
			Theme:          theme,
			MaxPlayers:     cap,
			Status:         "waiting",
			HostSessionID:  session.SessionID,
			Players:        map[string]*RoomPlayerEntry{session.SessionID: {SessionID: session.SessionID, PlayerName: playerName, SocketID: &socketID, ScoreBreakdown: []types.FieldClaim{}}},
			RelayFieldClaims: services.InitRelayClaims(),
			RelayRound:     1,
			PlayerOrder:    []string{session.SessionID},
			BattlePhase:    "playing",
			RelayPhase:     "playing",
		}

		registryMu.Lock()
		rooms[code] = room
		socketToRoom[socketID] = code
		registryMu.Unlock()

		s.Join(socketio.Room(code))
		state := roomToState(room)
		ackAck(ack, types.RoomJoinResponse{Room: state, SessionID: session.SessionID, Session: session})
		broadcastRoom(io, room)
	})

	onEvent(s, "room:rejoin", func(payload map[string]any, ack socketio.Ack) {
		defer recoverAck(ack)
		roomCode := strings.ToUpper(strings.TrimSpace(strField(payload, "roomCode")))
		sessionID := strings.TrimSpace(strField(payload, "sessionId"))
		if roomCode == "" || sessionID == "" {
			ackAck(ack, types.RoomJoinResponse{Error: "缺少参数"})
			return
		}

		registryMu.RLock()
		room := rooms[roomCode]
		registryMu.RUnlock()
		if room == nil {
			ackAck(ack, types.RoomJoinResponse{Error: "房间不存在"})
			return
		}

		room.mu.Lock()
		entry, ok := room.Players[sessionID]
		if !ok {
			room.mu.Unlock()
			ackAck(ack, types.RoomJoinResponse{Error: "未找到玩家"})
			return
		}
		socketID := string(s.Id())
		entry.SocketID = &socketID
		room.mu.Unlock()

		registryMu.Lock()
		socketToRoom[socketID] = roomCode
		registryMu.Unlock()
		s.Join(socketio.Room(roomCode))

		session, _ := services.BuildGameSession(sessionID)
		if room.Mode == "relay-chain" && room.Status == "playing" {
			scheduleRelayTurnTimer(io, room, false)
		}
		if room.Status == "waiting" {
			maybeStartWaitingRoom(io, room)
		}

		state := roomToState(room)
		ackAck(ack, types.RoomJoinResponse{Room: state, SessionID: sessionID, Session: session})
		broadcastRoom(io, room)
	})

	onEvent(s, "room:join", func(payload map[string]any, ack socketio.Ack) {
		defer recoverAck(ack)
		roomCode := strings.ToUpper(strings.TrimSpace(strField(payload, "roomCode")))
		playerName := strField(payload, "playerName")
		if roomCode == "" || playerName == "" {
			ackAck(ack, types.RoomJoinResponse{Error: "缺少参数"})
			return
		}

		registryMu.RLock()
		room := rooms[roomCode]
		registryMu.RUnlock()
		if room == nil {
			ackAck(ack, types.RoomJoinResponse{Error: "房间不存在"})
			return
		}

		room.mu.Lock()
		if room.Status != "waiting" {
			room.mu.Unlock()
			ackAck(ack, types.RoomJoinResponse{Error: "游戏已开始或已结束"})
			return
		}
		if len(room.Players) >= room.MaxPlayers {
			room.mu.Unlock()
			ackAck(ack, types.RoomJoinResponse{Error: "房间已满"})
			return
		}
		room.mu.Unlock()

		gameMode := types.GameMode(room.Mode)
		session, err := services.CreateBattleSession(playerName, room.Theme, gameMode, roomCode)
		if err != nil {
			ackAck(ack, types.RoomJoinResponse{Error: err.Error()})
			return
		}

		socketID := string(s.Id())
		room.mu.Lock()
		room.Players[session.SessionID] = &RoomPlayerEntry{
			SessionID:      session.SessionID,
			PlayerName:     playerName,
			SocketID:       &socketID,
			ScoreBreakdown: []types.FieldClaim{},
		}
		room.PlayerOrder = append(room.PlayerOrder, session.SessionID)
		room.mu.Unlock()

		registryMu.Lock()
		socketToRoom[socketID] = roomCode
		registryMu.Unlock()
		s.Join(socketio.Room(roomCode))

		maybeStartWaitingRoom(io, room)
		state := roomToState(room)
		ackAck(ack, types.RoomJoinResponse{Room: state, SessionID: session.SessionID, Session: session})
		broadcastRoom(io, room)
	})

	onEvent(s, "room:guess", func(payload map[string]any, ack socketio.Ack) {
		defer recoverAck(ack)
		roomCode := strings.ToUpper(strings.TrimSpace(strField(payload, "roomCode")))
		sessionID := strings.TrimSpace(strField(payload, "sessionId"))
		guessText := strField(payload, "guessText")
		characterID := optionalStringField(payload, "characterId")

		registryMu.RLock()
		room := rooms[roomCode]
		registryMu.RUnlock()
		if room == nil || sessionID == "" || guessText == "" {
			ackAck(ack, types.RoomGuessResponse{Error: "缺少参数"})
			return
		}
		if room.Status != "playing" {
			ackAck(ack, types.RoomGuessResponse{Error: "游戏未进行中"})
			return
		}

		var result *types.RoomGuessResponse
		var err error

		room.mu.Lock()
		if room.Mode == "relay-chain" {
			if room.RelayPhase == "intermission" {
				room.mu.Unlock()
				ackAck(ack, types.RoomGuessResponse{Error: "本题已结束，请等待下一题"})
				return
			}
			if room.RelayTurnSessionID == nil || *room.RelayTurnSessionID != sessionID {
				room.mu.Unlock()
				ackAck(ack, types.RoomGuessResponse{Error: "还没轮到你作答"})
				return
			}
			relayCtx := relayContext(room)
			room.mu.Unlock()

			result, err = services.ProcessRelayGuess(sessionID, guessText, characterID, relayCtx)
			if err != nil {
				ackAck(ack, types.RoomGuessResponse{Error: err.Error()})
				return
			}

			room.mu.Lock()
			room.RelayFieldClaims = relayCtx.RelayFieldClaims
			entry := room.Players[sessionID]
			if entry != nil && len(result.ScoreBreakdown) > 0 {
				entry.ScoreBreakdown = append(entry.ScoreBreakdown, result.ScoreBreakdown...)
			}
			if result.FullCorrect != nil && *result.FullCorrect {
				room.RelayPhase = "intermission"
				room.RelayIntermissionWinnerID = &sessionID
				roundResult, rerr := services.BuildRelayRoundResult(
					room.CurrentQuestionIndex, room.RelayRound, battlePlayers(room),
					sessionID, result.ScoreBreakdown,
				)
				if rerr != nil {
					room.mu.Unlock()
					ackAck(ack, types.RoomGuessResponse{Error: rerr.Error()})
					return
				}
				room.RelayRoundResult = roundResult
				clearRelayTurnTimer(room)
				scheduleRelayIntermission(io, room)
			} else {
				turnRoom := relayTurnRoom(room)
				room.RelayNotice = services.AdvanceRelayTurn(turnRoom, sessionID)
				services.EnsureRelayTurnActive(turnRoom)
				syncRelayTurnRoom(room, turnRoom)
				scheduleRelayTurnTimer(io, room, true)
			}
		} else {
			if room.BattlePhase == "intermission" {
				room.mu.Unlock()
				ackAck(ack, types.RoomGuessResponse{Error: "本题已结束，请等待下一题"})
				return
			}
			idx := room.CurrentQuestionIndex
			playerOrder := append([]string(nil), room.PlayerOrder...)
			questionQueue := room.QuestionQueue
			room.mu.Unlock()

			ctx := &services.RoomGuessContext{
				QuestionQueue:        questionQueue,
				CurrentQuestionIndex: &idx,
				PlayerOrder:          playerOrder,
				Mode:                 "battle",
			}
			result, err = services.ProcessRoomGuess(sessionID, guessText, characterID, ctx)
			if err != nil {
				ackAck(ack, types.RoomGuessResponse{Error: err.Error()})
				return
			}

			room.mu.Lock()
			if result.Session != nil && result.Session.LastGuessCorrect != nil && *result.Session.LastGuessCorrect {
				room.BattlePhase = "intermission"
				battleResult, rerr := services.SettleBattleRound(battleRoomInfo(room), sessionID, result)
				if rerr != nil {
					room.mu.Unlock()
					ackAck(ack, types.RoomGuessResponse{Error: rerr.Error()})
					return
				}
				room.BattleResult = battleResult
				scheduleBattleIntermission(io, room)
			} else if !services.IsBattleQuestionWon(playerOrder) && services.IsBattleQuestionExhausted(playerOrder) {
				room.BattlePhase = "intermission"
				drawResult, rerr := services.SettleBattleDrawRound(battleRoomInfo(room))
				if rerr != nil {
					room.mu.Unlock()
					ackAck(ack, types.RoomGuessResponse{Error: rerr.Error()})
					return
				}
				room.BattleResult = drawResult
				scheduleBattleIntermission(io, room)
			}
		}

		finished := finishRoomIfNeeded(room)
		if finished {
			clearRelayTurnTimer(room)
			clearBattleIntermissionTimer(room)
			clearRelayIntermissionTimer(room)
			room.mu.Unlock()
			io.To(socketio.Room(room.Code)).Emit("game:finished", roomToState(room))
		} else {
			room.mu.Unlock()
		}
		broadcastRoom(io, room)
		ackAck(ack, result)
	})

	onEvent(s, "room:next", func(payload map[string]any, ack socketio.Ack) {
		defer recoverAck(ack)
		roomCode := strings.ToUpper(strings.TrimSpace(strField(payload, "roomCode")))
		sessionID := strings.TrimSpace(strField(payload, "sessionId"))
		registryMu.RLock()
		room := rooms[roomCode]
		registryMu.RUnlock()
		if room == nil || room.Mode != "relay-chain" || sessionID == "" {
			ackAck(ack, map[string]any{"error": "无效请求"})
			return
		}
		room.mu.Lock()
		if room.RelayTurnSessionID == nil || *room.RelayTurnSessionID != sessionID {
			room.mu.Unlock()
			ackAck(ack, map[string]any{"error": "还没轮到你"})
			return
		}
		room.mu.Unlock()
		session, _ := services.BuildGameSession(sessionID)
		ackAck(ack, map[string]any{"session": session})
		broadcastRoom(io, room)
	})

	onEvent(s, "room:leave", func(payload map[string]any, ack socketio.Ack) {
		sessionID := strings.TrimSpace(strField(payload, "sessionId"))
		code := leaveSocket(s, io, sessionID)
		var state *types.RoomState
		if code != "" {
			if room := GetRoom(code); room != nil && room.Status == "finished" {
				state = roomToState(room)
			}
		}
		ackAck(ack, types.RoomLeaveResponse{Room: state})
	})

	s.On("disconnect", func(...any) {
		leaveSocket(s, io, "")
	})
}

func onEvent(s *socketio.Socket, event string, handler func(map[string]any, socketio.Ack)) {
	_ = s.On(event, func(datas ...any) {
		payload, ack := parseEventArgs(datas)
		handler(payload, ack)
	})
}

func parseEventArgs(datas []any) (map[string]any, socketio.Ack) {
	var ack socketio.Ack
	if len(datas) > 0 {
		if fn, ok := datas[len(datas)-1].(socketio.Ack); ok {
			ack = fn
			datas = datas[:len(datas)-1]
		}
	}
	payload := map[string]any{}
	if len(datas) > 0 {
		if m, ok := datas[0].(map[string]any); ok {
			payload = m
		}
	}
	return payload, ack
}

func ackAck(ack socketio.Ack, resp any) {
	if ack != nil {
		ack([]any{resp}, nil)
	}
}

func recoverAck(ack socketio.Ack) {
	if r := recover(); r != nil {
		if err, ok := r.(error); ok {
			ackAck(ack, types.RoomJoinResponse{Error: err.Error()})
		} else if s, ok := r.(string); ok {
			ackAck(ack, types.RoomJoinResponse{Error: s})
		}
	}
}

func strField(m map[string]any, key string) string {
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	return strings.TrimSpace(toString(v))
}

func optionalStringField(m map[string]any, key string) *string {
	s := strField(m, key)
	if s == "" {
		return nil
	}
	return &s
}

func intField(m map[string]any, key string, def int) int {
	v, ok := m[key]
	if !ok || v == nil {
		return def
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	default:
		return def
	}
}

func toString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	default:
		return ""
	}
}

func relayContext(room *Room) *services.RelayRoomContext {
	return &services.RelayRoomContext{
		RelayFieldClaims:   room.RelayFieldClaims,
		RelayRound:         room.RelayRound,
		PlayerOrder:        append([]string(nil), room.PlayerOrder...),
		RelayTurnSessionID: room.RelayTurnSessionID,
	}
}

func syncRelayTurnRoom(room *Room, turnRoom *services.RelayTurnRoom) {
	room.RelayTurnSessionID = turnRoom.RelayTurnSessionID
	room.RelayNoticeSeq = turnRoom.RelayNoticeSeq
}

func relayTurnRoom(room *Room) *services.RelayTurnRoom {
	players := map[string]*services.RelayTurnPlayer{}
	for sid, entry := range room.Players {
		if entry != nil {
			players[sid] = &services.RelayTurnPlayer{PlayerName: entry.PlayerName}
		}
	}
	return &services.RelayTurnRoom{
		PlayerOrder:        append([]string(nil), room.PlayerOrder...),
		RelayTurnSessionID: room.RelayTurnSessionID,
		Players:            players,
		RelayNoticeSeq:     room.RelayNoticeSeq,
	}
}

func battlePlayers(room *Room) map[string]*services.BattleRoomPlayer {
	out := map[string]*services.BattleRoomPlayer{}
	for sid, entry := range room.Players {
		if entry != nil {
			out[sid] = &services.BattleRoomPlayer{PlayerName: entry.PlayerName}
		}
	}
	return out
}

func battleRoomInfo(room *Room) *services.BattleRoomInfo {
	return &services.BattleRoomInfo{
		CurrentQuestionIndex: room.CurrentQuestionIndex,
		PlayerOrder:          append([]string(nil), room.PlayerOrder...),
		Players:              battlePlayers(room),
		Theme:                room.Theme,
	}
}

func clearBattleIntermissionTimer(room *Room) {
	if room.BattleIntermissionTimer != nil {
		room.BattleIntermissionTimer.Stop()
		room.BattleIntermissionTimer = nil
	}
}

func clearRelayIntermissionTimer(room *Room) {
	if room.RelayIntermissionTimer != nil {
		room.RelayIntermissionTimer.Stop()
		room.RelayIntermissionTimer = nil
	}
}

func clearRelayTurnTimer(room *Room) {
	if room.RelayTurnTimer != nil {
		room.RelayTurnTimer.Stop()
		room.RelayTurnTimer = nil
	}
}

func advanceBattleRoomQuestion(room *Room) bool {
	nextIndex := room.CurrentQuestionIndex + 1
	if nextIndex >= services.BattleQuestionCount {
		endRoom(room, "十道题已完成")
		return false
	}
	room.CurrentQuestionIndex = nextIndex
	nextSetup := room.QuestionQueue[nextIndex]
	resetAttempts := true
	for _, sid := range room.PlayerOrder {
		qIdx := nextIndex
		_ = services.ApplySessionFromSetup(sid, nextSetup, &services.ApplySessionOptions{
			QuestionIndex: &qIdx,
			ResetAttempts: resetAttempts,
		})
	}
	room.BattlePhase = "playing"
	room.BattleResult = nil
	room.IntermissionDeadlineAt = nil
	return true
}

func advanceRelayRoomQuestion(room *Room, winnerSessionID string) bool {
	nextIndex := room.CurrentQuestionIndex + 1
	if nextIndex >= len(room.QuestionQueue) {
		endRoom(room, "题目已完成")
		return false
	}
	nextSetup := room.QuestionQueue[nextIndex]
	room.CurrentQuestionIndex = nextIndex
	room.RelayFieldClaims = services.InitRelayClaims()
	room.RelayRound++
	for _, sid := range room.PlayerOrder {
		qIdx := nextIndex
		_ = services.ApplySessionFromSetup(sid, nextSetup, &services.ApplySessionOptions{QuestionIndex: &qIdx})
	}
	room.RelayPhase = "playing"
	room.RelayRoundResult = nil
	room.IntermissionDeadlineAt = nil
	room.RelayIntermissionWinnerID = nil
	turnRoom := relayTurnRoom(room)
	room.RelayNotice = services.AdvanceRelayTurn(turnRoom, winnerSessionID)
	syncRelayTurnRoom(room, turnRoom)
	return true
}

func scheduleRelayIntermission(io *socketio.Server, room *Room) {
	clearRelayIntermissionTimer(room)
	deadline := time.Now().UnixMilli() + int64(services.BattleIntermissionSeconds*1000)
	room.IntermissionDeadlineAt = &deadline
	code := room.Code
	room.RelayIntermissionTimer = time.AfterFunc(time.Duration(services.BattleIntermissionSeconds)*time.Second, func() {
		registryMu.RLock()
		still := rooms[code]
		registryMu.RUnlock()
		if still == nil {
			return
		}
		still.mu.Lock()
		defer still.mu.Unlock()
		if still.RelayPhase != "intermission" {
			return
		}
		winnerID := still.RelayIntermissionWinnerID
		if winnerID == nil {
			return
		}
		advanced := advanceRelayRoomQuestion(still, *winnerID)
		if !advanced && still.Status == "finished" {
			io.To(socketio.Room(still.Code)).Emit("game:finished", roomSnapshot(still))
		} else {
			turnRoom := relayTurnRoom(still)
			services.EnsureRelayTurnActive(turnRoom)
			syncRelayTurnRoom(still, turnRoom)
			scheduleRelayTurnTimer(io, still, true)
		}
		broadcastRoom(io, still)
	})
}

func scheduleBattleIntermission(io *socketio.Server, room *Room) {
	clearBattleIntermissionTimer(room)
	deadline := time.Now().UnixMilli() + int64(services.BattleIntermissionSeconds*1000)
	room.IntermissionDeadlineAt = &deadline
	code := room.Code
	room.BattleIntermissionTimer = time.AfterFunc(time.Duration(services.BattleIntermissionSeconds)*time.Second, func() {
		registryMu.RLock()
		still := rooms[code]
		registryMu.RUnlock()
		if still == nil {
			return
		}
		still.mu.Lock()
		defer still.mu.Unlock()
		if still.BattlePhase != "intermission" {
			return
		}
		advanced := advanceBattleRoomQuestion(still)
		if !advanced && still.Status == "finished" {
			io.To(socketio.Room(still.Code)).Emit("game:finished", roomSnapshot(still))
		}
		broadcastRoom(io, still)
	})
}

func scheduleRelayTurnTimer(io *socketio.Server, room *Room, resetStart bool) {
	clearRelayTurnTimer(room)
	if room.Mode != "relay-chain" || room.Status != "playing" {
		return
	}
	turnRoom := relayTurnRoom(room)
	services.EnsureRelayTurnActive(turnRoom)
	syncRelayTurnRoom(room, turnRoom)
	if room.RelayTurnSessionID == nil {
		return
	}
	now := time.Now().UnixMilli()
	if resetStart || room.RelayTurnStartedAt == nil {
		room.RelayTurnStartedAt = &now
	}
	room.RelayTurnEpoch++
	epoch := room.RelayTurnEpoch
	elapsed := now - *room.RelayTurnStartedAt
	remaining := int64(services.RelayTurnSeconds)*1000 - elapsed
	if remaining < 0 {
		remaining = 0
	}
	code := room.Code
	room.RelayTurnTimer = time.AfterFunc(time.Duration(remaining)*time.Millisecond, func() {
		registryMu.RLock()
		still := rooms[code]
		registryMu.RUnlock()
		if still == nil {
			return
		}
		still.mu.Lock()
		if still.RelayTurnEpoch != epoch {
			still.mu.Unlock()
			return
		}
		still.mu.Unlock()
		handleRelayTurnTimeout(io, code)
	})
}

func handleRelayTurnTimeout(io *socketio.Server, code string) {
	registryMu.RLock()
	room := rooms[code]
	registryMu.RUnlock()
	if room == nil || room.Status != "playing" || room.Mode != "relay-chain" {
		return
	}

	room.mu.Lock()
	sessionID := room.RelayTurnSessionID
	if sessionID == nil {
		room.mu.Unlock()
		return
	}
	sid := *sessionID
	relayCtx := relayContext(room)
	room.mu.Unlock()

	breakdown, _ := services.ProcessRelayTurnTimeout(sid, relayCtx)
	room.mu.Lock()
	entry := room.Players[sid]
	if entry != nil && len(breakdown) > 0 {
		entry.ScoreBreakdown = append(entry.ScoreBreakdown, breakdown...)
	}
	turnRoom := relayTurnRoom(room)
	room.RelayNotice = services.AdvanceRelayTurn(turnRoom, sid)
	services.EnsureRelayTurnActive(turnRoom)
	syncRelayTurnRoom(room, turnRoom)

	finished := finishRoomIfNeeded(room)
	if finished {
		clearRelayTurnTimer(room)
		room.mu.Unlock()
		io.To(socketio.Room(room.Code)).Emit("game:finished", roomToState(room))
	} else {
		scheduleRelayTurnTimer(io, room, true)
		room.mu.Unlock()
	}
	broadcastRoom(io, room)
}

func roomToState(room *Room) *types.RoomState {
	room.mu.Lock()
	state := roomSnapshot(room)
	room.mu.Unlock()
	return state
}

func roomSnapshot(room *Room) *types.RoomState {

	players := make([]types.RoomPlayerState, 0, len(room.PlayerOrder))
	for _, sid := range room.PlayerOrder {
		entry := room.Players[sid]
		if entry == nil {
			continue
		}
		sess, _ := services.BuildGameSession(sid)
		ps := types.RoomPlayerState{
			SessionID:      sid,
			PlayerName:     entry.PlayerName,
			Score:          0,
			CorrectCount:   0,
			AttemptsLeft:   0,
			QuestionIndex:  0,
			Status:         types.StatusPlaying,
			Connected:      entry.SocketID != nil,
			ScoreBreakdown: entry.ScoreBreakdown,
		}
		if sess != nil {
			ps.Score = sess.Score
			ps.CorrectCount = sess.CorrectCount
			ps.AttemptsLeft = sess.AttemptsLeft
			ps.QuestionIndex = sess.QuestionIndex
			ps.Status = sess.Status
		}
		players = append(players, ps)
	}

	var currentTurnPlayer *string
	if room.RelayTurnSessionID != nil {
		if entry := room.Players[*room.RelayTurnSessionID]; entry != nil {
			name := entry.PlayerName
			currentTurnPlayer = &name
		}
	}

	playerNames := map[string]string{}
	for _, sid := range room.PlayerOrder {
		if entry := room.Players[sid]; entry != nil {
			playerNames[sid] = entry.PlayerName
		}
	}

	isRelayPlaying := room.Mode == "relay-chain" && room.Status == "playing"
	state := &types.RoomState{
		Code:                 room.Code,
		Mode:                 room.Mode,
		Theme:                room.Theme,
		MaxPlayers:           room.MaxPlayers,
		Status:               room.Status,
		Players:              players,
		CurrentTurnSessionID: room.RelayTurnSessionID,
		CurrentTurnPlayer:    currentTurnPlayer,
		FieldClaims:          services.ClaimsToList(room.RelayFieldClaims),
		RelayRound:           room.RelayRound,
		FinishReason:         room.FinishReason,
		RelayNotice:          room.RelayNotice,
	}

	if isRelayPlaying {
		relaySecs := services.RelayTurnSeconds
		state.RelayTurnSeconds = &relaySecs
		if room.RelayTurnStartedAt != nil {
			deadline := *room.RelayTurnStartedAt + int64(services.RelayTurnSeconds*1000)
			state.TurnDeadlineAt = &deadline
		}
		if guesses, err := services.GetRelayGuessesForRoom(room.PlayerOrder, playerNames, room.Theme, room.CurrentQuestionIndex); err == nil {
			state.RelayGuesses = guesses
		}
		if history, err := services.GetRelayCorrectHistory(room.PlayerOrder, playerNames, room.Theme); err == nil {
			state.RelayCorrectHistory = history
		}
		if attempts, err := services.CountRelayQuestionAttempts(room.PlayerOrder, room.CurrentQuestionIndex); err == nil {
			state.RelaySharedQuestionAttempts = &attempts
		}
		if hints, err := services.BuildRelayHintsForRoom(room.PlayerOrder, room.Theme, room.CurrentQuestionIndex); err == nil {
			state.RelayHints = hints
		}
	}

	if room.Mode == "battle" && room.Status == "playing" {
		state.BattlePhase = room.BattlePhase
		if room.BattlePhase == "intermission" {
			state.BattleResult = room.BattleResult
		}
		totalQ := services.BattleQuestionCount
		state.BattleTotalQuestions = &totalQ
	}

	if room.Mode == "relay-chain" && room.Status == "playing" {
		state.RelayPhase = room.RelayPhase
		if room.RelayPhase == "intermission" {
			state.RelayRoundResult = room.RelayRoundResult
		}
	}

	if room.Status == "playing" {
		qIdx := room.CurrentQuestionIndex
		state.CurrentQuestionIndex = &qIdx
		inIntermission := (room.Mode == "battle" && room.BattlePhase == "intermission") ||
			(room.Mode == "relay-chain" && room.RelayPhase == "intermission")
		if inIntermission {
			state.IntermissionDeadlineAt = room.IntermissionDeadlineAt
		}
		intermissionSecs := services.BattleIntermissionSeconds
		state.BattleIntermissionSeconds = &intermissionSecs
	}

	if room.Status == "finished" && room.RevealedAnswer != nil {
		state.RevealedAnswer = room.RevealedAnswer
	}

	return state
}

func broadcastRoom(io *socketio.Server, room *Room) {
	room.mu.Lock()
	state := roomSnapshot(room)
	room.mu.Unlock()
	_ = io.To(socketio.Room(room.Code)).Emit("room:state", state)
}

func countConnectedPlayers(room *Room) int {
	count := 0
	for _, entry := range room.Players {
		if entry != nil && entry.SocketID != nil {
			count++
		}
	}
	return count
}

func maybeStartWaitingRoom(io *socketio.Server, room *Room) {
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.Status != "waiting" {
		return
	}
	if countConnectedPlayers(room) < room.MaxPlayers {
		return
	}
	startRoomGame(room)
	if room.Mode == "relay-chain" {
		scheduleRelayTurnTimer(io, room, true)
	}
	io.To(socketio.Room(room.Code)).Emit("game:start", roomSnapshot(room))
}

func startRoomGame(room *Room) {
	queueSize := questionQueueSize
	if room.Mode == "battle" {
		queueSize = services.BattleQuestionCount
	}
	queue, err := services.GenerateQuestionQueue(room.Theme, queueSize, "room:"+room.Code)
	if err != nil || len(queue) == 0 {
		return
	}
	room.Status = "playing"
	room.QuestionQueue = queue
	room.CurrentQuestionIndex = 0
	room.RelayRound = 1
	room.RelayTurnStartedAt = nil
	room.RelayTurnEpoch = 0
	room.BattlePhase = "playing"
	room.BattleResult = nil
	room.RelayPhase = "playing"
	room.RelayRoundResult = nil
	room.RelayIntermissionWinnerID = nil
	room.IntermissionDeadlineAt = nil
	room.RelayNotice = nil
	room.RelayNoticeSeq = 0
	room.RevealedAnswer = nil

	firstSessionID := room.PlayerOrder[0]
	room.RelayTurnSessionID = &firstSessionID

	resetAttempts := room.Mode == "battle"
	for _, sessionID := range room.PlayerOrder {
		opts := &services.ApplySessionOptions{ResetQuestionIndex: true}
		if resetAttempts {
			opts.ResetAttempts = true
		}
		_ = services.ApplySessionFromSetup(sessionID, queue[0], opts)
	}

	if room.Mode == "relay-chain" {
		turnRoom := relayTurnRoom(room)
		services.EnsureRelayTurnActive(turnRoom)
		syncRelayTurnRoom(room, turnRoom)
	}
}

func endRoom(room *Room, reason string) {
	room.Status = "finished"
	room.FinishReason = reason
	room.RelayNotice = nil
	answerID := services.GetSharedRoomAnswerId(room.PlayerOrder)
	normalComplete := reason == "十道题已完成" || reason == "题目已完成"
	if !normalComplete && answerID != nil {
		revealed := services.BuildRoomRevealedAnswer(room.Theme, *answerID)
		room.RevealedAnswer = &revealed
	}
	clearRelayTurnTimer(room)
	clearBattleIntermissionTimer(room)
	clearRelayIntermissionTimer(room)
}

// FinishRoomIfNeeded 当所有玩家用尽尝试次数时结束接龙房间。
func FinishRoomIfNeeded(room *Room) bool {
	return finishRoomIfNeeded(room)
}

func finishRoomIfNeeded(room *Room) bool {
	if room.Status != "playing" {
		return false
	}
	if room.Mode != "relay-chain" {
		return false
	}
	for _, sid := range room.PlayerOrder {
		sess, err := services.BuildGameSession(sid)
		if err != nil || sess == nil {
			continue
		}
		if sess.AttemptsLeft > 0 && sess.Status != types.StatusGameOver {
			return false
		}
	}
	endRoom(room, "所有玩家机会已用尽")
	return true
}

func leaveSocket(s *socketio.Socket, io *socketio.Server, sessionID string) string {
	socketID := string(s.Id())
	registryMu.RLock()
	code := socketToRoom[socketID]
	registryMu.RUnlock()
	if code == "" {
		return ""
	}

	registryMu.RLock()
	room := rooms[code]
	registryMu.RUnlock()
	if room == nil {
		return code
	}

	room.mu.Lock()
	leftSessionID := sessionID
	if leftSessionID == "" {
		for sid, entry := range room.Players {
			if entry != nil && entry.SocketID != nil && *entry.SocketID == socketID {
				leftSessionID = sid
				entry.SocketID = nil
				break
			}
		}
	} else if entry := room.Players[leftSessionID]; entry != nil {
		entry.SocketID = nil
	}
	room.mu.Unlock()

	registryMu.Lock()
	delete(socketToRoom, socketID)
	registryMu.Unlock()
	s.Leave(socketio.Room(code))

	if room.Status == "playing" && leftSessionID != "" {
		room.mu.Lock()
		clearRelayTurnTimer(room)
		clearBattleIntermissionTimer(room)
		clearRelayIntermissionTimer(room)
		playerName := "玩家"
		if entry := room.Players[leftSessionID]; entry != nil {
			playerName = entry.PlayerName
		}
		endRoom(room, playerName+" 已退出")
		room.mu.Unlock()
		io.To(socketio.Room(code)).Emit("game:finished", roomToState(room))
	} else if room.Status == "waiting" && leftSessionID == room.HostSessionID {
		room.mu.Lock()
		endRoom(room, "房主已离开")
		room.mu.Unlock()
		registryMu.Lock()
		delete(rooms, code)
		registryMu.Unlock()
	}

	broadcastRoom(io, room)
	return code
}
