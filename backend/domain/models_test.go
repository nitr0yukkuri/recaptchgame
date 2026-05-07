package domain

import (
	"testing"
)

// TestPlayer プレイヤーエンティティのテスト
func TestPlayer(t *testing.T) {
	player := NewPlayer("player1")

	// 初期状態の確認
	if player.ID != "player1" {
		t.Errorf("expected player id player1, got %s", player.ID)
	}
	if player.Score != 0 {
		t.Errorf("expected initial score 0, got %d", player.Score)
	}
	if player.Combo != 0 {
		t.Errorf("expected initial combo 0, got %d", player.Combo)
	}

	// スコア増加
	player.IncreaseScore()
	if player.Score != 1 {
		t.Errorf("expected score 1, got %d", player.Score)
	}

	// コンボ増加
	player.IncreaseCombo()
	if player.Combo != 1 {
		t.Errorf("expected combo 1, got %d", player.Combo)
	}

	// コンボリセット
	player.ResetCombo()
	if player.Combo != 0 {
		t.Errorf("expected combo 0 after reset, got %d", player.Combo)
	}
}

// TestRoom ルームエンティティのテスト
func TestRoom(t *testing.T) {
	room := NewRoom("room1", "player1", "player2", 5)

	// 初期状態の確認
	if room.ID != "room1" {
		t.Errorf("expected room id room1, got %s", room.ID)
	}
	if room.WinningScore != 5 {
		t.Errorf("expected winning score 5, got %d", room.WinningScore)
	}
	if !room.IsReady() {
		t.Errorf("expected room to be ready")
	}
	if room.IsActive {
		t.Errorf("expected room not to be active at start")
	}

	// ゲーム開始
	room.Start()
	if !room.IsActive {
		t.Errorf("expected room to be active after start")
	}

	// ゲーム終了判定（スコア < WinningScore）
	if room.IsGameOver() {
		t.Errorf("expected game not to be over at start")
	}

	// Player1が勝利条件に達する
	room.Player1.Score = 5
	if !room.IsGameOver() {
		t.Errorf("expected game to be over when player1 score >= winning score")
	}

	winner := room.GetWinner()
	if winner != "player1" {
		t.Errorf("expected winner player1, got %s", winner)
	}

	// GetPlayerByID
	player1 := room.GetPlayerByID("player1")
	if player1.ID != "player1" {
		t.Errorf("expected to get player1")
	}

	// GetGameStateByPlayerID
	gs1 := room.GetGameStateByPlayerID("player1")
	if gs1 != room.GameState1 {
		t.Errorf("expected GameState1")
	}

	// GetOpponentGameState
	oppGS := room.GetOpponentGameState("player1")
	if oppGS != room.GameState2 {
		t.Errorf("expected opponent GameState2")
	}
}

// TestGameState ゲーム状態エンティティのテスト
func TestGameState(t *testing.T) {
	gs := NewGameState("car", []string{"img1", "img2", "img3"})

	if gs.Target != "car" {
		t.Errorf("expected target car, got %s", gs.Target)
	}
	if len(gs.Images) != 3 {
		t.Errorf("expected 3 images, got %d", len(gs.Images))
	}

	// 状態更新
	gs.UpdateState("train", []string{"img4", "img5"})
	if gs.Target != "train" {
		t.Errorf("expected target to be updated to train, got %s", gs.Target)
	}
	if len(gs.Images) != 2 {
		t.Errorf("expected 2 images after update, got %d", len(gs.Images))
	}
}

// TestProblem 問題エンティティのテスト
func TestProblem(t *testing.T) {
	// テスト用画像リスト
	testImages := []string{
		"/images/car1.jpg",
		"/images/car2.jpg",
		"/images/shingouki1.jpg",
		"/images/kaidan1.jpg",
	}

	problem := NewProblem("車", testImages)

	if problem.Target != "車" {
		t.Errorf("expected target 車, got %s", problem.Target)
	}

	// 正答インデックスを取得
	correctIndices := problem.GetCorrectIndices()
	if len(correctIndices) == 0 {
		t.Errorf("expected correct indices for 車")
	}

	// 正答を検証
	if !problem.VerifyAnswer(correctIndices) {
		t.Errorf("expected correct answer to be verified")
	}

	// 不正解を検証
	wrongIndices := []int{2}
	if problem.VerifyAnswer(wrongIndices) {
		t.Errorf("expected incorrect answer to not be verified")
	}

	// 部分正解を検証
	partialCorrect := []int{correctIndices[0]}
	if len(correctIndices) > 1 && problem.VerifyAnswer(partialCorrect) {
		t.Errorf("expected partial correct to not be verified")
	}
}

// TestWinningScoreDefault デフォルトのWinningScore設定テスト
func TestWinningScoreDefault(t *testing.T) {
	// WinningScoreが0以下の場合、デフォルト値5が設定されるはず
	room := NewRoom("room1", "player1", "player2", 0)
	if room.WinningScore != 5 {
		t.Errorf("expected default winning score 5, got %d", room.WinningScore)
	}

	room2 := NewRoom("room2", "player1", "player2", -1)
	if room2.WinningScore != 5 {
		t.Errorf("expected default winning score 5 for negative value, got %d", room2.WinningScore)
	}
}

// TestMultipleRooms 複数ルームのシナリオテスト
func TestMultipleRooms(t *testing.T) {
	room1 := NewRoom("room1", "player1", "player2", 3)
	room2 := NewRoom("room2", "player3", "player4", 5)

	// 各ルームが独立していることを確認
	room1.Player1.IncreaseScore()
	room2.Player1.IncreaseScore()
	room2.Player1.IncreaseScore()

	if room1.Player1.Score != 1 {
		t.Errorf("expected room1 player1 score 1, got %d", room1.Player1.Score)
	}

	if room2.Player1.Score != 2 {
		t.Errorf("expected room2 player1 score 2, got %d", room2.Player1.Score)
	}

	// ゲーム終了判定が独立していることを確認
	if room1.IsGameOver() {
		t.Errorf("expected room1 not to be over")
	}

	if room2.IsGameOver() {
		t.Errorf("expected room2 not to be over")
	}

	room1.Player1.Score = 3
	if !room1.IsGameOver() {
		t.Errorf("expected room1 to be over")
	}
	if room2.IsGameOver() {
		t.Errorf("expected room2 still not to be over")
	}
}

// TestTargetSearchKeyMapping ターゲット検索キーマッピングのテスト
func TestTargetSearchKeyMapping(t *testing.T) {
	expectedMap := map[string]string{
		"車":   "car",
		"信号機": "shingouki",
		"階段":  "kaidan",
		"消火栓": "shoukasen",
	}

	for target, expected := range expectedMap {
		actual, ok := TargetSearchKeyMap[target]
		if !ok {
			t.Errorf("expected target %s in map", target)
		}
		if actual != expected {
			t.Errorf("expected search key %s for target %s, got %s", expected, target, actual)
		}
	}
}
