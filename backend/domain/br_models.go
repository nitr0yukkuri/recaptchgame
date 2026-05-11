package domain

// BRPlayer はバトルロイヤルゲーム内のプレイヤーを表すドメインエンティティ
type BRPlayer struct {
	ID    string
	Score int
	Combo int
}

// NewBRPlayer は新しいBRプレイヤーを生成する
func NewBRPlayer(id string) *BRPlayer {
	return &BRPlayer{
		ID:    id,
		Score: 0,
		Combo: 0,
	}
}

func (p *BRPlayer) IncreaseScore() { p.Score++ }
func (p *BRPlayer) IncreaseCombo() { p.Combo++ }
func (p *BRPlayer) ResetCombo()    { p.Combo = 0 }

// BattleRoyaleRoom はバトルロイヤル用のゲームルームを表すドメインエンティティ
type BattleRoyaleRoom struct {
	ID           string
	MaxPlayers   int
	Players      map[string]*BRPlayer
	GameStates   map[string]*GameState
	WinningScore int
	IsActive     bool
}

// NewBattleRoyaleRoom は新しいBRルームを生成
func NewBattleRoyaleRoom(id string, winningScore int, maxPlayers int) *BattleRoyaleRoom {
	if winningScore <= 0 {
		winningScore = 5
	}
	if maxPlayers <= 0 {
		maxPlayers = 4
	}

	return &BattleRoyaleRoom{
		ID:           id,
		MaxPlayers:   maxPlayers,
		Players:      make(map[string]*BRPlayer),
		GameStates:   make(map[string]*GameState),
		WinningScore: winningScore,
		IsActive:     false,
	}
}

// AddPlayer はプレイヤーをルームに追加する
func (r *BattleRoyaleRoom) AddPlayer(playerID string) bool {
	if len(r.Players) >= r.MaxPlayers {
		return false // 満員
	}
	if _, exists := r.Players[playerID]; exists {
		return true // 既に参加済み
	}
	r.Players[playerID] = NewBRPlayer(playerID)
	r.GameStates[playerID] = NewGameState("", []string{})
	return true
}

// RemovePlayer はプレイヤーをルームから削除する
func (r *BattleRoyaleRoom) RemovePlayer(playerID string) {
	delete(r.Players, playerID)
	delete(r.GameStates, playerID)
}

// IsReady はルームが開始可能な状態（満員）かどうか
func (r *BattleRoyaleRoom) IsReady() bool {
	return len(r.Players) == r.MaxPlayers
}

// Start はゲームを開始
func (r *BattleRoyaleRoom) Start() {
	r.IsActive = true
}

// IsGameOver は誰かが勝利条件を満たしたか判定する
func (r *BattleRoyaleRoom) IsGameOver() bool {
	for _, p := range r.Players {
		if p.Score >= r.WinningScore {
			return true
		}
	}
	return false
}

// GetWinner は勝者のIDを返す。終了していない場合は空文字列
func (r *BattleRoyaleRoom) GetWinner() string {
	for _, p := range r.Players {
		if p.Score >= r.WinningScore {
			return p.ID
		}
	}
	return ""
}

// EvaluateComboAndApplyObstruction はコンボを評価して妨害発動判定を行う
// バトルロイヤルでは、コンボが2以上なら妨害（全体攻撃）を発動し、コンボをリセット
func (r *BattleRoyaleRoom) EvaluateComboAndApplyObstruction(playerID string) bool {
	player, exists := r.Players[playerID]
	if !exists {
		return false
	}
	if player.Combo >= 2 {
		player.ResetCombo()
		return true // 妨害発動
	}
	return false
}
