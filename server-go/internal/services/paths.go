package services

import (
	"os"
	"path/filepath"
)

// resolveDataDir 无论工作目录如何，定位 server-go/data。
func resolveDataDir() string {
	candidates := []string{
		"data",
		filepath.Join("server-go", "data"),
		filepath.Join("..", "server-go", "data"),
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "data"),
			filepath.Join(exeDir, "..", "data"),
		)
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(wd, "data"))
	}
	for _, p := range candidates {
		if _, err := os.Stat(filepath.Join(p, "pokemon.json")); err == nil {
			return p
		}
	}
	return "data"
}

var dataDir = resolveDataDir()

// DataDir 是主题 JSON 文件的解析路径。
var DataDir = resolveDataDir()
