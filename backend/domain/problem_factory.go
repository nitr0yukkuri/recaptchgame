package domain

import (
	"fmt"
	"math/rand"
	"strings"
)

const signalSplitBaseImage = "/images/shingouki4.jpg"

var signalSplitCorrectTiles = []int{3, 4, 5}

// ProblemFactory は問題を生成するドメインサービス
// アルゴリズムはすべてドメイン層に封じ込める
type ProblemFactory struct{}

// NewProblemFactory は新しい ProblemFactory を生成
func NewProblemFactory() *ProblemFactory {
	return &ProblemFactory{}
}

// CreateProblem はドメインルールに基づいて問題を生成
// アルゴリズム：
//   1. ターゲット画像から3つ選択
//   2. その他から6つ追加
//   3. 全9枚をシャッフル
func (pf *ProblemFactory) CreateProblem(target string) *Problem {
	if target == string(TargetSignal) {
		return pf.createSplitImageProblem(target)
	}

	allImages := GetAllImageIDs()
	searchKey := GetSearchKey(target)

	// 正答と その他を分類
	var corrects []string
	var others []string

	for _, img := range allImages {
		if contains(img, searchKey) {
			corrects = append(corrects, img)
		} else {
			others = append(others, img)
		}
	}

	// シャッフル
	shuffleStrings(corrects)
	shuffleStrings(others)

	// 正答から3つ選択
	correctCount := 3
	if len(corrects) < 3 {
		correctCount = len(corrects)
	}

	selected := make([]string, 0)
	selected = append(selected, corrects[:correctCount]...)

	// 残りから補充
	remaining := append(others, corrects[correctCount:]...)
	shuffleStrings(remaining)

	// 9枚になるまで追加
	needed := 9 - len(selected)
	if len(remaining) < needed {
		selected = append(selected, remaining...)
	} else {
		selected = append(selected, remaining[:needed]...)
	}

	// 最後にシャッフル
	shuffleStrings(selected)

	return NewProblem(target, selected)
}

func (pf *ProblemFactory) createSplitImageProblem(target string) *Problem {
	images := make([]string, 9)
	for i := 0; i < 9; i++ {
		images[i] = fmt.Sprintf("%s#tile=%d", signalSplitBaseImage, i)
	}
	return NewProblem(target, images)
}

func isSplitTileImage(image string) (string, int, bool) {
	base, tilePart, ok := strings.Cut(image, "#tile=")
	if !ok {
		return "", 0, false
	}

	var tileIndex int
	if _, err := fmt.Sscanf(tilePart, "%d", &tileIndex); err != nil {
		return "", 0, false
	}

	return base, tileIndex, true
}

// Helper functions（アルゴリズム部分）

func shuffleStrings(s []string) {
	rand.Shuffle(len(s), func(i, j int) {
		s[i], s[j] = s[j], s[i]
	})
}
