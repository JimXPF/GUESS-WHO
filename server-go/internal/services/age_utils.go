package services

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// FootballAgeReferenceYear 是足球球员年龄的基准参考年份。
const FootballAgeReferenceYear = 2026

var birthDateRe = regexp.MustCompile(`^(\d{4})[-/](\d{1,2})[-/](\d{1,2})`)

// ComputeAgeFromBirthDate 根据 ISO 出生日期 (YYYY-MM-DD) 计算 asOf 时（服务器本地日期）的年龄。
func ComputeAgeFromBirthDate(birthDate string, asOf time.Time) *int {
	if asOf.IsZero() {
		asOf = time.Now()
	}
	parts := strings.FieldsFunc(birthDate, func(r rune) bool { return r == '-' || r == '/' })
	if len(parts) < 3 {
		return nil
	}
	year, err1 := strconv.Atoi(parts[0])
	month, err2 := strconv.Atoi(parts[1])
	day, err3 := strconv.Atoi(parts[2])
	if err1 != nil || err2 != nil || err3 != nil {
		return nil
	}

	age := asOf.Year() - year
	todayCode := int(asOf.Month())*100 + asOf.Day()
	birthCode := month*100 + day
	if todayCode < birthCode {
		age--
	}
	if age < 0 || age > 120 {
		return nil
	}
	return &age
}

// ComputeAgeFromReferenceYear 将以 referenceYear 为基准的足球年龄调整到 asOf。
func ComputeAgeFromReferenceYear(baseAge any, referenceYear int, asOf time.Time) *int {
	if referenceYear == 0 {
		referenceYear = FootballAgeReferenceYear
	}
	if asOf.IsZero() {
		asOf = time.Now()
	}

	var age int
	switch v := baseAge.(type) {
	case int:
		age = v
	case int64:
		age = int(v)
	case float64:
		age = int(v)
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil {
			return nil
		}
		age = n
	default:
		return nil
	}
	if age < 0 || age > 120 {
		return nil
	}
	delta := asOf.Year() - referenceYear
	current := age + delta
	if current < 0 || current > 120 {
		return nil
	}
	return &current
}

// NormalizeBirthDate 尽可能将 birthDate 规范化为 YYYY-MM-DD。
func NormalizeBirthDate(raw any) *string {
	s, ok := raw.(string)
	if !ok || strings.TrimSpace(s) == "" {
		return nil
	}
	text := strings.TrimSpace(s)
	m := birthDateRe.FindStringSubmatch(text)
	if m == nil {
		return nil
	}
	y, _ := strconv.Atoi(m[1])
	mo, _ := strconv.Atoi(m[2])
	d, _ := strconv.Atoi(m[3])
	out := time.Date(y, time.Month(mo), d, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	return &out
}
