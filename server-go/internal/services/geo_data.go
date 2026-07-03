package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type countryInfo struct {
	Continent string   `json:"continent"`
	Groups    []string `json:"groups"`
}

type geoDataFile struct {
	Countries       map[string]countryInfo `json:"countries"`
	ProximityGroups [][]string             `json:"proximityGroups"`
}

var (
	geoOnce          sync.Once
	geoCountries     map[string]countryInfo
	geoProximity     [][]string
	geoLoadErr       error
)

func loadGeoData() {
	geoOnce.Do(func() {
		path := resolveGeoPath()
		data, err := os.ReadFile(path)
		if err != nil {
			geoLoadErr = fmt.Errorf("read geo data: %w", err)
			return
		}
		var doc geoDataFile
		if err := json.Unmarshal(data, &doc); err != nil {
			geoLoadErr = fmt.Errorf("parse geo data: %w", err)
			return
		}
		geoCountries = doc.Countries
		geoProximity = doc.ProximityGroups
	})
}

func resolveGeoPath() string {
	candidates := []string{
		filepath.Join(DataDir, "geo", "nationality-regions.json"),
		filepath.Join("server-go", "data", "geo", "nationality-regions.json"),
		filepath.Join("data", "geo", "nationality-regions.json"),
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(wd, "data", "geo", "nationality-regions.json"))
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return filepath.Join(DataDir, "geo", "nationality-regions.json")
}

// CompareNationality 使用邻近分组逻辑比较 nationality/nationalTeam。
func CompareNationality(guess, answer any) CompareResult {
	loadGeoData()
	if geoLoadErr != nil {
		return compareNationalityExact(guess, answer)
	}

	g := fmt.Sprintf("%v", guess)
	a := fmt.Sprintf("%v", answer)
	g = trimGeo(g)
	a = trimGeo(a)
	if g == a {
		return Hit
	}

	gInfo, gOk := geoCountries[g]
	aInfo, aOk := geoCountries[a]
	if !gOk || !aOk {
		return Miss
	}

	for _, group := range geoProximity {
		if groupContains(group, g) && groupContains(group, a) {
			return Close
		}
	}

	gGroups := make(map[string]bool, len(gInfo.Groups))
	for _, grp := range gInfo.Groups {
		gGroups[grp] = true
	}
	for _, grp := range aInfo.Groups {
		if gGroups[grp] {
			return Close
		}
	}
	return Miss
}

func compareNationalityExact(guess, answer any) CompareResult {
	g := trimGeo(fmt.Sprintf("%v", guess))
	a := trimGeo(fmt.Sprintf("%v", answer))
	if g == a {
		return Hit
	}
	return Miss
}

func trimGeo(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}

func groupContains(group []string, country string) bool {
	for _, c := range group {
		if c == country {
			return true
		}
	}
	return false
}
