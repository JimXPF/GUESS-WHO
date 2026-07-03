package services

import (
	"math/bits"
	"strconv"
	"time"

	"guess-who/server-go/internal/types"
)

// SeededRng 与 Node 后端使用的 Mulberry32 + 自定义哈希一致。
type SeededRng struct {
	state uint32
}

func NewSeededRng(seed uint32) *SeededRng {
	if seed == 0 {
		seed = 1
	}
	return &SeededRng{state: seed}
}

func HashStringToSeed(input string) uint32 {
	h := uint32(1779033703) ^ uint32(len(input))
	for i := 0; i < len(input); i++ {
		h = imul(h^uint32(input[i]), 3432918353)
		h = bits.RotateLeft32(h, 13)
	}
	if h == 0 {
		h = 1
	}
	return h
}

func imul(a, b uint32) uint32 {
	return uint32(int32(a) * int32(b))
}

func (r *SeededRng) Next() float64 {
	r.state += 0x6d2b79f5
	t := r.state
	t = imul(t^(t>>15), t|1)
	t ^= t + imul(t^(t>>7), t|61)
	return float64((t^(t>>14))>>0) / 4294967296.0
}

func (r *SeededRng) NextInt(max int) int {
	if max <= 0 {
		return 0
	}
	return int(r.Next() * float64(max))
}

// PickOneString 是类型化辅助函数（方法上避免泛型，兼容 Go < 1.18 风格）
func (r *SeededRng) PickOneString(arr []string) string {
	if len(arr) == 0 {
		return ""
	}
	return arr[r.NextInt(len(arr))]
}

func (r *SeededRng) ShuffleStrings(arr []string) []string {
	copyArr := make([]string, len(arr))
	copy(copyArr, arr)
	for i := len(copyArr) - 1; i > 0; i-- {
		j := r.NextInt(i + 1)
		copyArr[i], copyArr[j] = copyArr[j], copyArr[i]
	}
	return copyArr
}

// QuestionSetupSeed 从会话 ID 与题号生成题目随机种子（须哈希 UUID 本身，不能只用长度）。
func QuestionSetupSeed(sessionID string, theme types.Theme, questionIndex int) uint32 {
	return HashStringToSeed(sessionID + string(theme) + ":q" + strconv.Itoa(questionIndex))
}

// GetUtc8DateString 返回 UTC+8 日历日期 YYYY-MM-DD。
func GetUtc8DateString() string {
	return time.Now().UTC().Add(8 * time.Hour).Format("2006-01-02")
}
