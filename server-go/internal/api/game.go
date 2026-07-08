package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"guess-who/server-go/internal/services"
	"guess-who/server-go/internal/types"

	"github.com/go-chi/chi/v5"
)

var validThemes = map[types.Theme]bool{
	types.ThemeCSGO: true, types.ThemeFootball: true, types.ThemeNBA: true, types.ThemePokemon: true,
}

var validModes = map[types.GameMode]bool{
	types.ModeClassicSix: true, types.ModeDailyOne: true,
	types.ModeProgressive: true, types.ModeReverseBomb: true,
}

// RegisterGameRoutes 挂载游戏 REST API 端点。
func RegisterGameRoutes(r chi.Router) {
	r.Post("/api/game/start", handleStart)
	r.Get("/api/game/suggest", handleSuggest)
	r.Post("/api/game/guess", handleGuess)
	r.Post("/api/game/next", handleNext)
	r.Post("/api/game/quit", handleQuit)
	r.Get("/api/game/reverse-fields", handleReverseFields)
	r.Get("/api/game/reverse-values", handleReverseValues)
	r.Post("/api/game/reverse-query", handleReverseQuery)
	r.Get("/api/game/{sessionId}", handleGetSession)
	r.Get("/api/leaderboard", handleLeaderboard)
	r.Get("/api/leaderboard/daily/today", handleDailyToday)
	r.Get("/api/health", handleHealth)
	r.Get("/api/ladder/invites", handleLadderInvites)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func handleStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PlayerName string         `json:"playerName"`
		Theme      types.Theme    `json:"theme"`
		GameMode   types.GameMode `json:"gameMode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad request")
		return
	}

	playerKey := services.GetClientKey(r)
	sess, err := services.StartSession(req.PlayerName, req.Theme, req.GameMode, playerKey)
	if err != nil {
		var dailyErr *types.DailyAlreadyPlayedError
		if errors.As(err, &dailyErr) {
			writeJSON(w, http.StatusConflict, map[string]interface{}{
				"error":     dailyErr.Error(),
				"code":      dailyErr.Code,
				"sessionId": dailyErr.SessionID,
			})
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

func handleSuggest(w http.ResponseWriter, r *http.Request) {
	theme := types.Theme(r.URL.Query().Get("theme"))
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	results := services.SuggestCharacters(theme, q)
	writeJSON(w, http.StatusOK, map[string]interface{}{"results": results})
}

func handleGuess(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID   string  `json:"sessionId"`
		GuessText   string  `json:"guessText"`
		CharacterID *string `json:"characterId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad request")
		return
	}

	resp, err := services.SubmitGuess(req.SessionID, req.GuessText, req.CharacterID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleNext(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad request")
		return
	}
	sess, err := services.NextQuestion(req.SessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

func handleQuit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad request")
		return
	}
	sess, err := services.QuitGame(req.SessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

func handleReverseFields(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("sessionId")
	fields, err := services.GetReverseFieldsForSession(sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, fields)
}

func handleReverseValues(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("sessionId")
	field := r.URL.Query().Get("field")
	resp, err := services.GetReverseValuesForSession(sessionID, field)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleReverseQuery(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string                 `json:"sessionId"`
		Condition types.ReverseCondition `json:"condition"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad request")
		return
	}
	resp, err := services.SubmitReverseQuerySession(req.SessionID, req.Condition)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleGetSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	sess, err := services.GetSession(sessionID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

func handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 20
	}
	gameMode := types.GameMode(r.URL.Query().Get("gameMode"))
	if gameMode == "" {
		gameMode = types.ModeClassicSix
	}
	if !validModes[gameMode] {
		writeError(w, http.StatusBadRequest, "无效模式")
		return
	}

	themeStr := r.URL.Query().Get("theme")
	var themePtr *types.Theme
	if themeStr != "" {
		theme := types.Theme(themeStr)
		if !validThemes[theme] {
			writeError(w, http.StatusBadRequest, "无效主题")
			return
		}
		themePtr = &theme
	}

	if gameMode == types.ModeDailyOne {
		if themePtr == nil {
			writeError(w, http.StatusBadRequest, "每日榜需指定主题")
			return
		}
		entries, err := services.GetDailyLeaderboard(*themePtr, limit, "")
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, entries)
		return
	}

	entries, err := services.GetLeaderboard(limit, gameMode, themePtr)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func handleDailyToday(w http.ResponseWriter, r *http.Request) {
	theme := types.Theme(r.URL.Query().Get("theme"))
	if !validThemes[theme] {
		writeError(w, http.StatusBadRequest, "无效主题")
		return
	}
	info, err := services.GetDailyTodayInfo(theme, services.GetClientKey(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "backend": "go"})
}

func handleLadderInvites(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, services.ListLadderInvites())
}
