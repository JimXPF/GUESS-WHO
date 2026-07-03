package services

import (
	"net/http"
	"strings"
)

// GetClientKey 从请求头派生稳定的玩家标识。
func GetClientKey(r *http.Request) string {
	if userID := strings.TrimSpace(r.Header.Get("X-User-Id")); userID != "" {
		if len(userID) > 128 {
			userID = userID[:128]
		}
		return "uid:" + userID
	}

	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if first := strings.TrimSpace(parts[0]); first != "" {
			return "ip:" + first
		}
	}

	if realIP := strings.TrimSpace(r.Header.Get("X-Real-Ip")); realIP != "" {
		return "ip:" + realIP
	}

	ip := r.RemoteAddr
	if host, _, ok := strings.Cut(ip, ":"); ok && strings.Count(ip, ":") == 1 {
		ip = host
	}
	if ip == "" {
		ip = "unknown"
	}
	return "ip:" + ip
}
