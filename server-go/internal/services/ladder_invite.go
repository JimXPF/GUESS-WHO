package services

import (
	"sort"
	"strings"
	"sync"

	"guess-who/server-go/internal/types"
)

// LadderInviteInfo 是天梯邀请房间对外暴露的摘要，供平台弹窗与 REST 轮询使用。
type LadderInviteInfo struct {
	RoomCode      string      `json:"roomCode"`
	Theme         types.Theme `json:"theme"`
	Mode          string      `json:"mode"`
	HostName      string      `json:"hostName"`
	HostSessionID string      `json:"hostSessionId"`
	PlayerCount   int         `json:"playerCount"`
	MaxPlayers    int         `json:"maxPlayers"`
	CreatedAt     int64       `json:"createdAt"`
}

var (
	ladderInviteMu sync.RWMutex
	ladderInvites  = map[string]*LadderInviteInfo{}
)

// RegisterLadderInvite 登记或刷新等待中的天梯邀请房间。
func RegisterLadderInvite(info LadderInviteInfo) LadderInviteInfo {
	code := strings.ToUpper(strings.TrimSpace(info.RoomCode))
	info.RoomCode = code
	ladderInviteMu.Lock()
	defer ladderInviteMu.Unlock()
	ladderInvites[code] = &info
	return info
}

// UnregisterLadderInvite 移除天梯邀请；返回被移除的条目（若存在）。
func UnregisterLadderInvite(roomCode string) *LadderInviteInfo {
	code := strings.ToUpper(strings.TrimSpace(roomCode))
	ladderInviteMu.Lock()
	defer ladderInviteMu.Unlock()
	info, ok := ladderInvites[code]
	if !ok {
		return nil
	}
	delete(ladderInvites, code)
	return info
}

// ListLadderInvites 返回当前所有等待中的天梯邀请（按创建时间升序）。
func ListLadderInvites() []LadderInviteInfo {
	ladderInviteMu.RLock()
	defer ladderInviteMu.RUnlock()
	out := make([]LadderInviteInfo, 0, len(ladderInvites))
	for _, info := range ladderInvites {
		if info == nil {
			continue
		}
		out = append(out, *info)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt == out[j].CreatedAt {
			return out[i].RoomCode < out[j].RoomCode
		}
		return out[i].CreatedAt < out[j].CreatedAt
	})
	return out
}
