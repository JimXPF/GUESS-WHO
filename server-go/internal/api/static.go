package api

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

// RegisterStatic 从 client/dist 提供构建后的前端（SPA 回退）。
// 开发环境下，前端由 Vite 在 5173 端口提供（见 client/vite.config.ts）。
// Vite 开发服务器将 /api 和 /socket.io 代理到此 Go 后端。
func RegisterStatic(r chi.Router) {
	// 尝试相对于可能工作目录的常见位置
	distPaths := []string{
		filepath.Join("client", "dist"),
		filepath.Join("..", "client", "dist"),
		"dist",
	}

	var dist string
	for _, p := range distPaths {
		if _, err := os.Stat(filepath.Join(p, "index.html")); err == nil {
			dist = p
			break
		}
	}

	if dist == "" {
		log.Println("[WARN] client/dist not found. Access the frontend at http://localhost:5173 during development.")
		log.Println("[WARN] To serve a production build, run 'npm run build --prefix client' first.")
		return
	}

	fs := http.FileServer(http.Dir(dist))

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		// SPA 回退：若请求的文件不存在，则返回 index.html
		requestedPath := strings.TrimPrefix(r.URL.Path, "/")
		fullPath := filepath.Join(dist, requestedPath)

		// 根路径或文件不存在时，返回 index.html
		if r.URL.Path == "/" || r.URL.Path == "" {
			http.ServeFile(w, r, filepath.Join(dist, "index.html"))
			return
		}

		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			http.ServeFile(w, r, filepath.Join(dist, "index.html"))
			return
		}

		fs.ServeHTTP(w, r)
	})
}
