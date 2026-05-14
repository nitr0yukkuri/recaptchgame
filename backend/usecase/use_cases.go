package usecase

import (
	"fmt"
	"math/rand"
	"sync"

	"recaptchgame-backend/domain"
)

// RoomExecutionGuard はルーム単位で処理を直列化する
type RoomExecutionGuard struct {
	mu    sync.Mutex
	locks map[string]*sync.Mutex
}

// NewRoomExecutionGuard は新しいRoomExecutionGuardを生成
func NewRoomExecutionGuard() *RoomExecutionGuard {
	return &RoomExecutionGuard{locks: make(map[string]*sync.Mutex)}
}

// Lock は指定ルームのロックを取得し、解除関数を返す
func (g *RoomExecutionGuard) Lock(roomID string) func() {
	g.mu.Lock()
	lock, ok := g.locks[roomID]
	if !ok {
		lock = &sync.Mutex{}
		g.locks[roomID] = lock
	}
	g.mu.Unlock()

	lock.Lock()
	return func() {
		lock.Unlock()
	}
}

// ProblemGeneratorUseCase は問題生成のユースケース
// 手順のみを実行し、アルゴリズムはドメイン層（ProblemFactory）に委譲
type ProblemGeneratorUseCase struct {
	factory *domain.ProblemFactory
	targets []string
}

// NewProblemGeneratorUseCase は新しいProblemGeneratorUseCaseを生成
func NewProblemGeneratorUseCase(factory *domain.ProblemFactory, targets []string) *ProblemGeneratorUseCase {
	return &ProblemGeneratorUseCase{
		factory: factory,
		targets: targets,
	}
}

// Execute は問題を生成する
func (uc *ProblemGeneratorUseCase) Execute(prevTarget string) (*domain.Problem, error) {
	// 異なるターゲットを選択
	target := uc.selectDifferentTarget(prevTarget)
	// ドメインサービスに問題生成を委譲
	return uc.factory.CreateProblem(target), nil
}

// selectDifferentTarget は前回のターゲットと異なるターゲットを選択
func (uc *ProblemGeneratorUseCase) selectDifferentTarget(prevTarget string) string {
	for {
		target := uc.targets[rand.Intn(len(uc.targets))]
		if target != prevTarget {
			return target
		}
	}
}

// JoinRoomUseCase はプレイヤーがルームに参加するユースケース
type JoinRoomUseCase struct {
	roomRepo    domain.RoomRepository
	clientRepo  domain.ClientRepository
	idGenerator domain.IDGenerator
	roomGuard   *RoomExecutionGuard
}

// NewJoinRoomUseCase は新しいJoinRoomUseCaseを生成
func NewJoinRoomUseCase(roomRepo domain.RoomRepository, clientRepo domain.ClientRepository, idGenerator domain.IDGenerator, roomGuard *RoomExecutionGuard) *JoinRoomUseCase {
	return &JoinRoomUseCase{
		roomRepo:    roomRepo,
		clientRepo:  clientRepo,
		idGenerator: idGenerator,
		roomGuard:   roomGuard,
	}
}

// JoinRoomInput はJoinRoomの入力
type JoinRoomInput struct {
	ClientID     string
	PlayerID     string
	RoomID       string
	WinningScore int
}

// JoinRoomOutput はJoinRoomの出力
type JoinRoomOutput struct {
	ActualRoomID  string
	IsFirstPlayer bool
	RoomSize      int
}

// Execute はルーム参加を実行
func (uc *JoinRoomUseCase) Execute(input JoinRoomInput) (*JoinRoomOutput, error) {
	lockID := input.RoomID
	if lockID == "RANDOM" {
		lockID = "GLOBAL_RANDOM_LOCK"
	}
	unlock := uc.roomGuard.Lock(lockID)
	defer unlock()

	actualRoomID := input.RoomID
	createdNewRoom := false

	// RANDOMの場合は待機ルームを取得/作成
	if input.RoomID == "RANDOM" {
		waitingRoom, _ := uc.roomRepo.GetWaitingRoom()
		isFull := waitingRoom != nil && waitingRoom.Player1 != nil && waitingRoom.Player1.ID != "" && waitingRoom.Player2 != nil && waitingRoom.Player2.ID != ""
		if waitingRoom == nil || isFull {
			// 新しいルームを作成
			// ✅ IDGenerator を使用（DI）
			actualRoomID = uc.idGenerator.GenerateRoomID()
			newRoom := domain.NewRoom(actualRoomID, input.PlayerID, "", input.WinningScore)
			uc.roomRepo.Save(newRoom)
			uc.roomRepo.SetWaitingRoom(newRoom)
			createdNewRoom = true
		} else {
			actualRoomID = waitingRoom.ID
		}
	}

	// ルームを取得
	room, err := uc.roomRepo.FindByID(actualRoomID)
	if err != nil {
		// ルームが存在しない場合は作成
		room = domain.NewRoom(actualRoomID, input.PlayerID, "", input.WinningScore)
		uc.roomRepo.Save(room)
	} else if !createdNewRoom {
		// ルームが存在する場合、空いているスロットにプレイヤーを設定
		if room.Player1 == nil || room.Player1.ID == "" {
			room.Player1 = domain.NewPlayer(input.PlayerID)
		} else if room.Player2 == nil || room.Player2.ID == "" {
			room.Player2 = domain.NewPlayer(input.PlayerID)
		} else {
			// ルームが満員（2人以上）の場合は参加不可
			return nil, fmt.Errorf("room is full")
		}
	}

	// クライアントを割り当て
	uc.clientRepo.AssignClient(input.ClientID, input.PlayerID)

	// ルームを保存
	uc.roomRepo.Save(room)

	// ルームがいっぱいになったら待機ルームをクリア
	roomSize := 1
	if room.Player1 != nil && room.Player1.ID != "" && room.Player2 != nil && room.Player2.ID != "" {
		roomSize = 2
		if input.RoomID == "RANDOM" {
			uc.roomRepo.ClearWaitingRoom()
		}
	}

	return &JoinRoomOutput{
		ActualRoomID:  actualRoomID,
		IsFirstPlayer: true, // 簡略化
		RoomSize:      roomSize,
	}, nil
}

// VerifyAnswerUseCase は回答検証のユースケース
type VerifyAnswerUseCase struct {
	roomRepo    domain.RoomRepository
	problemGen  *ProblemGeneratorUseCase
	effectTypes []string
	roomGuard   *RoomExecutionGuard
}

// NewVerifyAnswerUseCase は新しいVerifyAnswerUseCaseを生成
func NewVerifyAnswerUseCase(roomRepo domain.RoomRepository, problemGen *ProblemGeneratorUseCase, effectTypes []string, roomGuard *RoomExecutionGuard) *VerifyAnswerUseCase {
	return &VerifyAnswerUseCase{
		roomRepo:    roomRepo,
		problemGen:  problemGen,
		effectTypes: effectTypes,
		roomGuard:   roomGuard,
	}
}

// VerifyAnswerInput はVerifyAnswerの入力
type VerifyAnswerInput struct {
	RoomID          string
	PlayerID        string
	SelectedIndices []int
}

// VerifyAnswerOutput はVerifyAnswerの出力
type VerifyAnswerOutput struct {
	IsCorrect       bool
	NewTarget       string
	NewImages       []string
	CurrentScore    int
	CurrentCombo    int
	IsGameOver      bool
	Winner          string
	SendObstruction bool
	Effect          string
}

// Execute は回答を検証
func (uc *VerifyAnswerUseCase) Execute(input VerifyAnswerInput) (*VerifyAnswerOutput, error) {
	unlock := uc.roomGuard.Lock(input.RoomID)
	defer unlock()

	room, err := uc.roomRepo.FindByID(input.RoomID)
	if err != nil {
		return nil, err
	}

	player := room.GetPlayerByID(input.PlayerID)
	if player == nil {
		return nil, fmt.Errorf("player not found")
	}

	gameState := room.GetGameStateByPlayerID(input.PlayerID)
	if gameState == nil {
		return nil, fmt.Errorf("game state not found")
	}

	problem := domain.NewProblem(gameState.Target, gameState.Images)

	isCorrect := problem.VerifyAnswer(input.SelectedIndices)

	output := &VerifyAnswerOutput{
		IsCorrect:    isCorrect,
		CurrentScore: player.Score,
		CurrentCombo: player.Combo,
	}

	if isCorrect {
		player.IncreaseScore()
		player.IncreaseCombo()
		output.CurrentScore = player.Score
		output.CurrentCombo = player.Combo

		// ゲーム終了判定
		if player.Score >= room.WinningScore {
			output.IsGameOver = true
			output.Winner = player.ID
			return output, nil
		}

		// 新しい問題を生成
		newProblem, _ := uc.problemGen.Execute(gameState.Target)
		gameState.UpdateState(newProblem.Target, newProblem.Images)
		output.NewTarget = newProblem.Target
		output.NewImages = newProblem.Images

		// ✅ ドメインメソッドに委譲（ビジネスルール判定）
		shouldObstruct := room.EvaluateComboAndApplyObstruction(input.PlayerID)
		if shouldObstruct {
			// リセット後の値を反映
			output.CurrentCombo = player.Combo
			output.SendObstruction = true
			// ← エフェクト選択は「戦術的」なのでユースケース層に残す
			output.Effect = uc.effectTypes[rand.Intn(len(uc.effectTypes))]
		}

		uc.roomRepo.Save(room)
	} else {
		// 不正解
		player.ResetCombo()
		output.CurrentCombo = player.Combo
		uc.roomRepo.Save(room)
	}

	return output, nil
}

// StartGameUseCase はゲーム開始のユースケース
type StartGameUseCase struct {
	roomRepo   domain.RoomRepository
	problemGen *ProblemGeneratorUseCase
}

// NewStartGameUseCase は新しいStartGameUseCaseを生成
func NewStartGameUseCase(roomRepo domain.RoomRepository, problemGen *ProblemGeneratorUseCase) *StartGameUseCase {
	return &StartGameUseCase{
		roomRepo:   roomRepo,
		problemGen: problemGen,
	}
}

// StartGameInput はStartGameの入力
type StartGameInput struct {
	RoomID string
}

// StartGameOutput はStartGameの出力
type StartGameOutput struct {
	Player1Target         string
	Player1Images         []string
	Player1OpponentImages []string
	Player2Target         string
	Player2Images         []string
	Player2OpponentImages []string
	WinningScore          int
}

// Execute はゲーム開始を実行
func (uc *StartGameUseCase) Execute(input StartGameInput) (*StartGameOutput, error) {
	room, err := uc.roomRepo.FindByID(input.RoomID)
	if err != nil {
		return nil, err
	}

	if !room.IsReady() {
		return nil, fmt.Errorf("room is not ready")
	}

	room.Start()

	// 両プレイヤーに問題を生成
	problem1, _ := uc.problemGen.Execute("")
	problem2, _ := uc.problemGen.Execute("")

	room.GameState1.UpdateState(problem1.Target, problem1.Images)
	room.GameState2.UpdateState(problem2.Target, problem2.Images)

	// スコア/コンボをリセット
	room.Player1.Score = 0
	room.Player1.Combo = 0
	room.Player2.Score = 0
	room.Player2.Combo = 0

	uc.roomRepo.Save(room)

	return &StartGameOutput{
		Player1Target:         problem1.Target,
		Player1Images:         problem1.Images,
		Player1OpponentImages: problem2.Images,
		Player2Target:         problem2.Target,
		Player2Images:         problem2.Images,
		Player2OpponentImages: problem1.Images,
		WinningScore:          room.WinningScore,
	}, nil
}

// LeaveRoomUseCase はプレイヤーがルームを退出するユースケース
type LeaveRoomUseCase struct {
	roomRepo   domain.RoomRepository
	clientRepo domain.ClientRepository
	roomGuard  *RoomExecutionGuard
}

// NewLeaveRoomUseCase は新しいLeaveRoomUseCaseを生成
func NewLeaveRoomUseCase(roomRepo domain.RoomRepository, clientRepo domain.ClientRepository, roomGuard *RoomExecutionGuard) *LeaveRoomUseCase {
	return &LeaveRoomUseCase{
		roomRepo:   roomRepo,
		clientRepo: clientRepo,
		roomGuard:  roomGuard,
	}
}

// LeaveRoomInput はLeaveRoomの入力
type LeaveRoomInput struct {
	ClientID string
	PlayerID string
}

// Execute はルーム退出を実行
func (uc *LeaveRoomUseCase) Execute(input LeaveRoomInput) error {
	uc.clientRepo.RemoveClient(input.ClientID)

	// 事前にルームを検索
	room, err := uc.roomRepo.FindByPlayerID(input.PlayerID)
	if err != nil {
		return nil // ルームが見つからない場合は無視
	}

	unlock := uc.roomGuard.Lock(room.ID)
	defer unlock()

	// ロック取得後に再度取得（間に状態が変わっている可能性があるため）
	room, err = uc.roomRepo.FindByPlayerID(input.PlayerID)
	if err != nil {
		return nil
	}

	// プレイヤーを削除
	if room.Player1 != nil && room.Player1.ID == input.PlayerID {
		room.Player1 = nil
	} else if room.Player2 != nil && room.Player2.ID == input.PlayerID {
		room.Player2 = nil
	}

	// ルームが空になったら削除
	if room.Player1 == nil && room.Player2 == nil {
		uc.roomRepo.Delete(room.ID)
		// 削除対象が現在の待機ルームと一致する場合のみクリア
		waitingRoom, _ := uc.roomRepo.GetWaitingRoom()
		if waitingRoom != nil && waitingRoom.ID == room.ID {
			uc.roomRepo.ClearWaitingRoom()
		}
	} else {
		uc.roomRepo.Save(room)
	}

	return nil
}
