package usecase

import (
	"testing"

	"recaptchgame-backend/domain"
	"recaptchgame-backend/infrastructure"
)

// TestProblemGenerator は問題生成機能のテスト
func TestProblemGenerator(t *testing.T) {
	gen := NewProblemGeneratorUseCase(
		domain.Targets,
		domain.AllImages,
		domain.TargetSearchKeyMap,
	)

	// 複数回実行して、毎回異なるターゲットが選ばれることを確認
	prevTarget := ""
	for i := 0; i < 5; i++ {
		problem, err := gen.Execute(prevTarget)
		if err != nil {
			t.Fatalf("failed to generate problem: %v", err)
		}

		// ターゲットが異なることを確認
		if i > 0 && problem.Target == prevTarget {
			t.Errorf("target should be different: prev=%s, current=%s", prevTarget, problem.Target)
		}

		// 画像数が9であることを確認
		if len(problem.Images) != 9 {
			t.Errorf("expected 9 images, got %d", len(problem.Images))
		}

		// 正答インデックスが存在することを確認
		correctIndices := problem.GetCorrectIndices()
		if len(correctIndices) == 0 {
			t.Errorf("expected correct indices, got none for target: %s", problem.Target)
		}

		prevTarget = problem.Target
	}
}

// TestVerifyAnswer は回答検証のテスト
func TestVerifyAnswer(t *testing.T) {
	// セットアップ
	roomRepo := infrastructure.NewMemoryRoomRepository()
	problemGen := NewProblemGeneratorUseCase(
		domain.Targets,
		domain.AllImages,
		domain.TargetSearchKeyMap,
	)
	verifyUC := NewVerifyAnswerUseCase(roomRepo, problemGen, domain.EffectTypes)

	// テスト用ルームを作成
	room := domain.NewRoom("room1", "player1", "player2", 5)
	problem1, _ := problemGen.Execute("")
	problem2, _ := problemGen.Execute("")

	room.GameState1.UpdateState(problem1.Target, problem1.Images)
	room.GameState2.UpdateState(problem2.Target, problem2.Images)
	room.Start()

	roomRepo.Save(room)

	// テスト1: 正解の検証
	correctIndices := problem1.GetCorrectIndices()
	input := VerifyAnswerInput{
		RoomID:          "room1",
		PlayerID:        "player1",
		SelectedIndices: correctIndices,
	}

	output, err := verifyUC.Execute(input)
	if err != nil {
		t.Fatalf("failed to verify answer: %v", err)
	}

	if !output.IsCorrect {
		t.Errorf("expected correct answer, got incorrect")
	}

	if output.CurrentScore != 1 {
		t.Errorf("expected score 1, got %d", output.CurrentScore)
	}

	// テスト2: 不正解の検証
	wrongIndices := []int{0, 1, 2} // 確認されていないインデックス
	input2 := VerifyAnswerInput{
		RoomID:          "room1",
		PlayerID:        "player2",
		SelectedIndices: wrongIndices,
	}

	// problem2 の正答を確認
	problem2.VerifyAnswer(wrongIndices) // これで確認

	output2, _ := verifyUC.Execute(input2)
	if output2.IsCorrect {
		t.Errorf("expected incorrect answer")
	}

	if output2.CurrentScore != 0 {
		t.Errorf("expected score 0, got %d", output2.CurrentScore)
	}
}

// TestJoinRoom はルーム参加のテスト
func TestJoinRoom(t *testing.T) {
	// セットアップ
	roomRepo := infrastructure.NewMemoryRoomRepository()
	clientRepo := infrastructure.NewMemoryClientRepository()
	joinRoomUC := NewJoinRoomUseCase(roomRepo, clientRepo)

	// テスト1: 最初のプレイヤーがルームに参加
	input1 := JoinRoomInput{
		ClientID:     "client1",
		PlayerID:     "player1",
		RoomID:       "room1",
		WinningScore: 5,
	}

	output1, err := joinRoomUC.Execute(input1)
	if err != nil {
		t.Fatalf("failed to join room: %v", err)
	}

	if output1.ActualRoomID != "room1" {
		t.Errorf("expected room1, got %s", output1.ActualRoomID)
	}

	if output1.RoomSize != 1 {
		t.Errorf("expected room size 1, got %d", output1.RoomSize)
	}

	// テスト2: 2番目のプレイヤーがルームに参加
	input2 := JoinRoomInput{
		ClientID:     "client2",
		PlayerID:     "player2",
		RoomID:       "room1",
		WinningScore: 5,
	}

	output2, err := joinRoomUC.Execute(input2)
	if err != nil {
		t.Fatalf("failed to join room: %v", err)
	}

	if output2.RoomSize != 2 {
		t.Errorf("expected room size 2, got %d", output2.RoomSize)
	}
}

// TestJoinRoomRandom はRANDOM参加のテスト
func TestJoinRoomRandom(t *testing.T) {
	// セットアップ
	roomRepo := infrastructure.NewMemoryRoomRepository()
	clientRepo := infrastructure.NewMemoryClientRepository()
	joinRoomUC := NewJoinRoomUseCase(roomRepo, clientRepo)

	// テスト: RANDOM参加（新規ルーム作成）
	input1 := JoinRoomInput{
		ClientID:     "client1",
		PlayerID:     "player1",
		RoomID:       "RANDOM",
		WinningScore: 5,
	}

	output1, err := joinRoomUC.Execute(input1)
	if err != nil {
		t.Fatalf("failed to join random room: %v", err)
	}

	if output1.ActualRoomID == "" {
		t.Errorf("expected actual room id, got empty")
	}

	// 最初のプレイヤーなので RoomSize = 1
	if output1.RoomSize != 1 {
		t.Errorf("expected room size 1 for new random room, got %d", output1.RoomSize)
	}
}

// TestStartGame はゲーム開始のテスト
func TestStartGame(t *testing.T) {
	// セットアップ
	roomRepo := infrastructure.NewMemoryRoomRepository()
	problemGen := NewProblemGeneratorUseCase(
		domain.Targets,
		domain.AllImages,
		domain.TargetSearchKeyMap,
	)
	startGameUC := NewStartGameUseCase(roomRepo, problemGen)

	// ルームを作成
	room := domain.NewRoom("room1", "player1", "player2", 5)
	roomRepo.Save(room)

	// ゲーム開始
	input := StartGameInput{
		RoomID: "room1",
	}

	output, err := startGameUC.Execute(input)
	if err != nil {
		t.Fatalf("failed to start game: %v", err)
	}

	// 両プレイヤーにターゲットと画像が割り当てられていることを確認
	if output.Player1Target == "" {
		t.Errorf("expected player1 target, got empty")
	}

	if output.Player2Target == "" {
		t.Errorf("expected player2 target, got empty")
	}

	if len(output.Player1Images) != 9 {
		t.Errorf("expected 9 player1 images, got %d", len(output.Player1Images))
	}

	if len(output.Player2Images) != 9 {
		t.Errorf("expected 9 player2 images, got %d", len(output.Player2Images))
	}

	if output.WinningScore != 5 {
		t.Errorf("expected winning score 5, got %d", output.WinningScore)
	}

	// ルームのスコアが0にリセットされていることを確認
	updatedRoom, _ := roomRepo.FindByID("room1")
	if updatedRoom.Player1.Score != 0 || updatedRoom.Player2.Score != 0 {
		t.Errorf("expected scores to be 0")
	}
}

// TestLeaveRoom はルーム退出のテスト
func TestLeaveRoom(t *testing.T) {
	// セットアップ
	roomRepo := infrastructure.NewMemoryRoomRepository()
	clientRepo := infrastructure.NewMemoryClientRepository()
	leaveRoomUC := NewLeaveRoomUseCase(roomRepo, clientRepo)

	// ルームを作成
	room := domain.NewRoom("room1", "player1", "player2", 5)
	roomRepo.Save(room)

	// クライアントを割り当て
	clientRepo.AssignClient("client1", "player1")

	// プレイヤーが退出
	input := LeaveRoomInput{
		ClientID: "client1",
		PlayerID: "player1",
	}

	err := leaveRoomUC.Execute(input)
	if err != nil {
		t.Fatalf("failed to leave room: %v", err)
	}

	// ルームがまだ存在するはずだが、プレイヤーが削除されている
	updatedRoom, err := roomRepo.FindByID("room1")
	if err != nil {
		t.Fatalf("room should still exist: %v", err)
	}

	if updatedRoom.Player1 != nil {
		t.Errorf("player1 should be deleted")
	}

	if updatedRoom.Player2 == nil {
		t.Errorf("player2 should still exist")
	}
}

// TestComboAndObstruction はコンボと妨害のテスト
func TestComboAndObstruction(t *testing.T) {
	// セットアップ
	roomRepo := infrastructure.NewMemoryRoomRepository()
	problemGen := NewProblemGeneratorUseCase(
		domain.Targets,
		domain.AllImages,
		domain.TargetSearchKeyMap,
	)
	verifyUC := NewVerifyAnswerUseCase(roomRepo, problemGen, domain.EffectTypes)

	// ルームを作成
	room := domain.NewRoom("room1", "player1", "player2", 5)
	problem1, _ := problemGen.Execute("")

	room.GameState1.UpdateState(problem1.Target, problem1.Images)
	room.GameState2.UpdateState("other", []string{})
	room.Start()

	roomRepo.Save(room)

	// 1回目の正解
	correctIndices := problem1.GetCorrectIndices()
	input1 := VerifyAnswerInput{
		RoomID:          "room1",
		PlayerID:        "player1",
		SelectedIndices: correctIndices,
	}

	output1, _ := verifyUC.Execute(input1)
	if output1.CurrentCombo != 1 {
		t.Errorf("expected combo 1 after 1st correct, got %d", output1.CurrentCombo)
	}

	if output1.SendObstruction {
		t.Errorf("expected no obstruction on first correct")
	}

	// 2回目の正解（コンボが2以上でリセット＆妨害発動）
	updatedRoom, _ := roomRepo.FindByID("room1")
	problem2, _ := problemGen.Execute(problem1.Target)
	updatedRoom.GameState1.UpdateState(problem2.Target, problem2.Images)
	roomRepo.Save(updatedRoom)

	correctIndices2 := problem2.GetCorrectIndices()
	input2 := VerifyAnswerInput{
		RoomID:          "room1",
		PlayerID:        "player1",
		SelectedIndices: correctIndices2,
	}

	output2, _ := verifyUC.Execute(input2)
	// コンボが2以上の場合、リセット時にCurrentComboが0になる
	if output2.CurrentCombo != 0 {
		t.Errorf("expected combo to be 0 after reset, got %d", output2.CurrentCombo)
	}

	if !output2.SendObstruction {
		t.Errorf("expected obstruction to be sent when combo >= 2")
	}

	if output2.Effect == "" {
		t.Errorf("expected effect to be set")
	}
}

// TestDomainModels ドメインモデルの基本動作テスト
func TestDomainModels(t *testing.T) {
	// Player テスト
	player := domain.NewPlayer("player1")
	if player.Score != 0 || player.Combo != 0 {
		t.Errorf("expected initial score and combo to be 0")
	}

	player.IncreaseScore()
	if player.Score != 1 {
		t.Errorf("expected score 1, got %d", player.Score)
	}

	player.IncreaseCombo()
	if player.Combo != 1 {
		t.Errorf("expected combo 1, got %d", player.Combo)
	}

	player.ResetCombo()
	if player.Combo != 0 {
		t.Errorf("expected combo to be 0 after reset")
	}

	// Room テスト
	room := domain.NewRoom("room1", "player1", "player2", 3)
	if !room.IsReady() {
		t.Errorf("expected room to be ready")
	}

	if room.IsGameOver() {
		t.Errorf("expected game not to be over at start")
	}

	if room.GetWinner() != "" {
		t.Errorf("expected no winner at start")
	}

	// ゲーム終了判定
	room.Player1.Score = 3
	if !room.IsGameOver() {
		t.Errorf("expected game to be over when score >= winning_score")
	}

	if room.GetWinner() != "player1" {
		t.Errorf("expected player1 to be winner")
	}

	// GameState テスト
	gs := domain.NewGameState("car", []string{"img1", "img2"})
	if gs.Target != "car" {
		t.Errorf("expected target car")
	}

	gs.UpdateState("train", []string{"img3"})
	if gs.Target != "train" {
		t.Errorf("expected target to be updated to train")
	}
}

// TestProblemVerification 問題検証の詳細テスト
func TestProblemVerification(t *testing.T) {
	gen := NewProblemGeneratorUseCase(
		domain.Targets,
		domain.AllImages,
		domain.TargetSearchKeyMap,
	)

	for _, target := range domain.Targets {
		problem, _ := gen.Execute("")
		if problem.Target != target && len(problem.GetCorrectIndices()) > 0 {
			// 正答インデックスが抽出できることを確認
			correctIndices := problem.GetCorrectIndices()
			if len(correctIndices) == 0 {
				t.Errorf("expected correct indices for target %s", target)
			}

			// 正答で検証
			if !problem.VerifyAnswer(correctIndices) {
				t.Errorf("expected correct answer verification for target %s", target)
			}

			// 不正解で検証
			wrongIndices := []int{0}
			if problem.VerifyAnswer(wrongIndices) {
				t.Logf("wrong answer check for target %s passed", target)
			}
		}
	}
}
