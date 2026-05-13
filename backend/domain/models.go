package domain

// Player はゲーム内のプレイヤーを表すドメインエンティティ
type Player struct {
	ID    string
	Score int
	Combo int
}

// NewPlayer は新しいプレイヤーを生成する
func NewPlayer(id string) *Player {
	return &Player{
		ID:    id,
		Score: 0,
		Combo: 0,
	}
}

// IncreaseScore はスコアを1増やす
func (p *Player) IncreaseScore() {
	p.Score++
}

// IncreaseCombo はコンボを1増やす
func (p *Player) IncreaseCombo() {
	p.Combo++
}

// ResetCombo はコンボをリセット
func (p *Player) ResetCombo() {
	p.Combo = 0
}

// GameState はゲーム状態を表すドメインエンティティ
type GameState struct {
	Target string   // 現在の出題
	Images []string // 表示されている画像のリスト
}

// NewGameState は新しいゲーム状態を生成
func NewGameState(target string, images []string) *GameState {
	return &GameState{
		Target: target,
		Images: images,
	}
}

// UpdateState はゲーム状態を更新
func (g *GameState) UpdateState(target string, images []string) {
	g.Target = target
	g.Images = images
}

// Room はゲームルームを表すドメインエンティティ
type Room struct {
	ID           string
	Player1      *Player
	Player2      *Player
	GameState1   *GameState
	GameState2   *GameState
	WinningScore int
	IsActive     bool
}

// NewRoom は新しいルームを生成
func NewRoom(id string, player1ID string, player2ID string, winningScore int) *Room {
	if winningScore <= 0 {
		winningScore = 5
	}

	var player2 *Player
	if player2ID != "" {
		player2 = NewPlayer(player2ID)
	}

	return &Room{
		ID:           id,
		Player1:      NewPlayer(player1ID),
		Player2:      player2,
		GameState1:   NewGameState("", []string{}),
		GameState2:   NewGameState("", []string{}),
		WinningScore: winningScore,
		IsActive:     false,
	}
}

// IsReady はルームが開始可能な状態かどうか
func (r *Room) IsReady() bool {
	return r.Player1 != nil && r.Player2 != nil && r.Player1.ID != "" && r.Player2.ID != ""
}

// Start はゲームを開始
func (r *Room) Start() {
	r.IsActive = true
}

// IsGameOver はゲームが終了したかどうか
func (r *Room) IsGameOver() bool {
	return (r.Player1 != nil && r.Player1.Score >= r.WinningScore) || (r.Player2 != nil && r.Player2.Score >= r.WinningScore)
}

// GetWinner は勝者を返す。終了していない場合は空文字列
func (r *Room) GetWinner() string {
	if r.Player1 != nil && r.Player1.Score >= r.WinningScore {
		return r.Player1.ID
	}
	if r.Player2 != nil && r.Player2.Score >= r.WinningScore {
		return r.Player2.ID
	}
	return ""
}

// GetPlayerByID はIDからプレイヤーを取得
func (r *Room) GetPlayerByID(playerID string) *Player {
	if r.Player1 != nil && r.Player1.ID == playerID {
		return r.Player1
	}
	if r.Player2 != nil && r.Player2.ID == playerID {
		return r.Player2
	}
	return nil
}

// GetGameStateByPlayerID はプレイヤーIDからゲーム状態を取得
func (r *Room) GetGameStateByPlayerID(playerID string) *GameState {
	if r.Player1 != nil && r.Player1.ID == playerID {
		return r.GameState1
	}
	if r.Player2 != nil && r.Player2.ID == playerID {
		return r.GameState2
	}
	return nil
}

// GetOpponentGameState は対戦相手のゲーム状態を取得
func (r *Room) GetOpponentGameState(playerID string) *GameState {
	if r.Player1 != nil && r.Player1.ID == playerID {
		return r.GameState2
	}
	if r.Player2 != nil && r.Player2.ID == playerID {
		return r.GameState1
	}
	return nil
}

// EvaluateComboAndApplyObstruction はコンボを評価して妨害発動判定を行う
// ドメインルール：コンボが2以上なら妨害を発動し、コンボをリセット
func (r *Room) EvaluateComboAndApplyObstruction(playerID string) bool {
	player := r.GetPlayerByID(playerID)
	if player.Combo >= 2 {
		player.ResetCombo()
		return true // 妨害発動
	}
	return false
}

// Problem は問題を表すドメインエンティティ
type Problem struct {
	Target string
	Images []string
}

// NewProblem は新しい問題を生成
func NewProblem(target string, images []string) *Problem {
	return &Problem{
		Target: target,
		Images: images,
	}
}

// GetCorrectIndices は正答のインデックスリストを返す
func (p *Problem) GetCorrectIndices() []int {
	if p.Target == string(TargetSignal) {
		return p.getCorrectSplitTileIndices()
	}

	searchKey := GetSearchKey(p.Target)
	var correctIndices []int

	for i, img := range p.Images {
		if contains(img, searchKey) {
			correctIndices = append(correctIndices, i)
		}
	}

	return correctIndices
}

func (p *Problem) getCorrectSplitTileIndices() []int {
	correctIndices := make([]int, 0)
	for i, img := range p.Images {
		_, tileIndex, ok := isSplitTileImage(img)
		if !ok {
			continue
		}
		for _, correctTile := range signalSplitCorrectTiles {
			if tileIndex == correctTile {
				correctIndices = append(correctIndices, i)
				break
			}
		}
	}
	return correctIndices
}

// VerifyAnswer はユーザーの回答が正解かどうかを検証
func (p *Problem) VerifyAnswer(selectedIndices []int) bool {
	correctIndices := p.GetCorrectIndices()

	if len(selectedIndices) != len(correctIndices) {
		return false
	}

	selectionMap := make(map[int]bool)
	for _, idx := range selectedIndices {
		selectionMap[idx] = true
	}

	for _, correctIdx := range correctIndices {
		if !selectionMap[correctIdx] {
			return false
		}
	}

	return true
}

// Helper function
func contains(str string, substr string) bool {
	var lowerStr string
	for _, r := range str {
		if r >= 'A' && r <= 'Z' {
			lowerStr += string(r + 32)
		} else {
			lowerStr += string(r)
		}
	}
	return stringContains(lowerStr, substr)
}

func stringContains(str, substr string) bool {
	if len(substr) == 0 {
		return true
	}
	for i := 0; i <= len(str)-len(substr); i++ {
		if str[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
