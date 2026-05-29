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
	counts map[string]int
}

// NewRoomExecutionGuard は新しいRoomExecutionGuardを生成
func NewRoomExecutionGuard() *RoomExecutionGuard {
	return &RoomExecutionGuard{locks: make(map[string]*sync.Mutex), counts: make(map[string]int)}
}

// Lock は指定ルームのロックを取得し、解除関数を返す
func (g *RoomExecutionGuard) Lock(roomID string) func() {
	g.mu.Lock()
	lock, ok := g.locks[roomID]
	if !ok {
		lock = &sync.Mutex{}
		g.locks[roomID] = lock
	}
	g.counts[roomID]++
	g.mu.Unlock()

	lock.Lock()
	return func() {
		lock.Unlock()
		g.mu.Lock()
		g.counts[roomID]--
		if g.counts[roomID] == 0 {
			delete(g.locks, roomID)
			delete(g.counts, roomID)
		}
		g.mu.Unlock()
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
	Capacity     int
}

// JoinRoomOutput はJoinRoomの出力
type JoinRoomOutput struct {
	ActualRoomID  string
	IsFirstPlayer bool
	RoomSize      int
	RoomCapacity  int
}

// Execute はルーム参加を実行
func (uc *JoinRoomUseCase) Execute(input JoinRoomInput) (*JoinRoomOutput, error) {
	actualRoomID := input.RoomID
	const maxRandomRetries = 3
	randomRetries := 0
	capacity := input.Capacity
	if capacity <= 0 {
		capacity = 2
	}

	// RANDOMの場合はまずグローバルロックで待機ルームを決定/IDを生成する
	if input.RoomID == "RANDOM" {
		globalUnlock := uc.roomGuard.Lock("GLOBAL_RANDOM_LOCK")
		waitingRoom, _ := uc.roomRepo.GetWaitingRoom(capacity)
		isFull := waitingRoom != nil && waitingRoom.CountPlayers() >= waitingRoom.Capacity
		if waitingRoom == nil || isFull {
			if isFull {
				_ = uc.roomRepo.ClearWaitingRoom(capacity)
			}
			// 新しいルームIDを生成（実際の保存は個別ルームロック下で行う）
			actualRoomID = uc.idGenerator.GenerateRoomID()
		} else {
			actualRoomID = waitingRoom.ID
		}
		globalUnlock()
	}

	// 個別ルームのロックを取りつつ、満員競合が起きた場合はRANDOMなら再試行する
	for {
		// 保護ブロック内でロックを取得し、必ず defer で解除することで
		// panic 発生時のロックリークを防ぐ（スコープも限定する）
		joinedOrStopped := false
		func() {
			unlock := uc.roomGuard.Lock(actualRoomID)
			defer unlock()

			room, err := uc.roomRepo.FindByID(actualRoomID)
			if err != nil {
				// ルームが存在しない場合（新規生成フロー）、個別ロック下で作成・保存
				room = domain.NewRoom(actualRoomID, input.PlayerID, "", input.WinningScore, capacity)
				uc.roomRepo.Save(room)
				if input.RoomID == "RANDOM" {
					uc.roomRepo.SetWaitingRoom(room.Capacity, room)
				}
				joinedOrStopped = true
				return
			}

			// 既に同一プレイヤーがいる場合は再登録しない
			if room.GetPlayerByID(input.PlayerID) != nil {
				joinedOrStopped = true
				return
			}

			// 空きスロットがあれば参加
			joined := false
			if room.Player1 == nil || room.Player1.ID == "" {
				room.Player1 = domain.NewPlayer(input.PlayerID)
				uc.roomRepo.Save(room)
				joined = true
			} else if room.Player2 == nil || room.Player2.ID == "" {
				room.Player2 = domain.NewPlayer(input.PlayerID)
				uc.roomRepo.Save(room)
				joined = true
			} else {
				for i := range room.ExtraPlayers {
					if room.ExtraPlayers[i] == nil || room.ExtraPlayers[i].ID == "" {
						room.ExtraPlayers[i] = domain.NewPlayer(input.PlayerID)
						uc.roomRepo.Save(room)
						joined = true
						break
					}
				}
			}
			if joined {
				joinedOrStopped = true
				return
			}

			// ここに到達するのはルームが満員のとき
			return
		}()

		if joinedOrStopped {
			break
		}

		if input.RoomID == "RANDOM" {
			if randomRetries >= maxRandomRetries {
				return nil, fmt.Errorf("random room join retries exceeded")
			}
			randomRetries++
			// 再試行: グローバルロック下で待機ルームを再確認
			globalUnlock := uc.roomGuard.Lock("GLOBAL_RANDOM_LOCK")
			waitingRoom, _ := uc.roomRepo.GetWaitingRoom(capacity)
			if waitingRoom != nil {
				// 待機ルームがまだ有効（いずれかのスロットに空きがある）なら使う
				if (waitingRoom.Player1 == nil || waitingRoom.Player1.ID == "") || (waitingRoom.Player2 == nil || waitingRoom.Player2.ID == "") {
					actualRoomID = waitingRoom.ID
					globalUnlock()
					continue
				}
				// 待機ルームが既に満員に変わっていたらクリアして新規作成へ
				uc.roomRepo.ClearWaitingRoom(waitingRoom.Capacity)
				actualRoomID = uc.idGenerator.GenerateRoomID()
				globalUnlock()
				continue
			}
			// 待機ルームが無ければ新規作成して再試行
			actualRoomID = uc.idGenerator.GenerateRoomID()
			globalUnlock()
			continue
		}

		return nil, fmt.Errorf("room is full")
	}

	// ルームを最新の状態で取得
	room, err := uc.roomRepo.FindByID(actualRoomID)
	if err != nil {
		return nil, err
	}

	// クライアントを割り当て
	uc.clientRepo.AssignClient(input.ClientID, input.PlayerID)

	// ルームを保存
	uc.roomRepo.Save(room)

	// ルームがいっぱいになったら待機ルームをクリア
	roomSize := room.CountPlayers()
	if roomSize >= room.Capacity {
		if input.RoomID == "RANDOM" {
			waitingRoom, _ := uc.roomRepo.GetWaitingRoom(room.Capacity)
			if waitingRoom != nil && waitingRoom.ID == actualRoomID {
				uc.roomRepo.ClearWaitingRoom(room.Capacity)
			}
		}
	}

	return &JoinRoomOutput{
		ActualRoomID:  actualRoomID,
		IsFirstPlayer: true, // 簡略化
		RoomSize:      roomSize,
		RoomCapacity:  room.Capacity,
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
			uc.roomRepo.Save(room)
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
			if len(uc.effectTypes) == 0 {
				output.Effect = string(domain.EffectShake)
			} else {
				output.Effect = uc.effectTypes[rand.Intn(len(uc.effectTypes))]
			}
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
	roomGuard  *RoomExecutionGuard
}

// NewStartGameUseCase は新しいStartGameUseCaseを生成
func NewStartGameUseCase(roomRepo domain.RoomRepository, problemGen *ProblemGeneratorUseCase, roomGuard *RoomExecutionGuard) *StartGameUseCase {
	return &StartGameUseCase{
		roomRepo:   roomRepo,
		problemGen: problemGen,
		roomGuard:  roomGuard,
	}
}

// StartGameInput はStartGameの入力
type StartGameInput struct {
	RoomID string
}

// StartGameOutput はStartGameの出力
type StartGameOutput struct {
	WinningScore int
}

// Execute はゲーム開始を実行
func (uc *StartGameUseCase) Execute(input StartGameInput) (*StartGameOutput, error) {
	unlock := uc.roomGuard.Lock(input.RoomID)
	defer unlock()

	room, err := uc.roomRepo.FindByID(input.RoomID)
	if err != nil {
		return nil, err
	}

	if !room.IsReady() {
		return nil, fmt.Errorf("room is not ready")
	}

	room.Start()

	// Generate problems for each player slot (player1, player2, extra players)
	// and reset scores
	// Player1
	problems := make([]*domain.Problem, 0)
	for i := 0; i < room.Capacity; i++ {
		p, _ := uc.problemGen.Execute("")
		problems = append(problems, p)
	}

	// Assign problems to game states
	if len(problems) > 0 {
		room.GameState1.UpdateState(problems[0].Target, problems[0].Images)
	}
	if len(problems) > 1 {
		room.GameState2.UpdateState(problems[1].Target, problems[1].Images)
	}
	for i := 2; i < len(problems); i++ {
		idx := i - 2
		if idx < len(room.ExtraGameStates) {
			room.ExtraGameStates[idx].UpdateState(problems[i].Target, problems[i].Images)
		}
	}

	// Reset scores/combo for all players
	if room.Player1 != nil {
		room.Player1.Score = 0
		room.Player1.Combo = 0
	}
	if room.Player2 != nil {
		room.Player2.Score = 0
		room.Player2.Combo = 0
	}
	for _, p := range room.ExtraPlayers {
		if p != nil {
			p.Score = 0
			p.Combo = 0
		}
	}

	uc.roomRepo.Save(room)

	return &StartGameOutput{
		WinningScore: room.WinningScore,
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

	// プレイヤーを削除（extra players を含む）
	if room.Player1 != nil && room.Player1.ID == input.PlayerID {
		room.Player1 = nil
	} else if room.Player2 != nil && room.Player2.ID == input.PlayerID {
		room.Player2 = nil
	} else {
		for i := range room.ExtraPlayers {
			if room.ExtraPlayers[i] != nil && room.ExtraPlayers[i].ID == input.PlayerID {
				room.ExtraPlayers[i] = nil
				break
			}
		}
	}

	// ルームが空になったら削除
	if room.CountPlayers() == 0 {
		uc.roomRepo.Delete(room.ID)
		// 削除対象が現在の待機ルームと一致する場合のみクリア
		waitingRoom, _ := uc.roomRepo.GetWaitingRoom(room.Capacity)
		if waitingRoom != nil && waitingRoom.ID == room.ID {
			uc.roomRepo.ClearWaitingRoom(room.Capacity)
		}
	} else {
		uc.roomRepo.Save(room)
	}

	return nil
}
