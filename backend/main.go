package main

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// ---------------------------------------------------------------------
// データ構造の定義
// ---------------------------------------------------------------------

// Message: クライアントとサーバー間でやり取りされるWebSocketメッセージの基本フォーマット
// Typeで処理を分岐し、Payloadに実際のデータが入ります。
type Message struct {
	Type    string          `json:"type"`    // メッセージの種類 (例: "JOIN_ROOM", "VERIFY")
	Payload json.RawMessage `json:"payload"` // データの中身 (JSON形式)
}

// PlayerState: サーバー側で保持するプレイヤー個別の状態
type PlayerState struct {
	Images []string // 現在表示されている画像のリスト（パス）
	Target string   // 現在のお題（例: "車"）
	Score  int      // 現在のスコア
	Combo  int      // 連続正解数（コンボ）
}

// --- フロントエンドと送受信するデータの定義 (Payload) ---

// JoinRoomPayload: 部屋参加リクエスト時のデータ
type JoinRoomPayload struct {
	RoomID       string `json:"room_id"`       // 部屋ID ("RANDOM"の場合は自動マッチング)
	PlayerID     string `json:"player_id"`     // プレイヤーの識別子
	WinningScore int    `json:"winning_score"` // 勝利に必要なスコア（設定用）
}

// RoomAssignedPayload: 部屋割り当て完了通知用データ
type RoomAssignedPayload struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
}

// VerifyPayload: ユーザーが画像を回答した際のデータ
type VerifyPayload struct {
	RoomID          string `json:"room_id"`
	PlayerID        string `json:"player_id"`
	SelectedIndices []int  `json:"selected_indices"` // ユーザーが選んだ画像のインデックス配列
}

// GameStartPayload: ゲーム開始時にクライアントへ送る初期データ
type GameStartPayload struct {
	Target         string   `json:"target"`          // 最初のお題
	Images         []string `json:"images"`          // 自分の画像リスト
	OpponentImages []string `json:"opponent_images"` // 相手の画像リスト（画面表示用）
	WinningScore   int      `json:"winning_score"`   // このゲームの勝利条件スコア
}

// UpdatePatternPayload: 正解後に新しい問題を通知するデータ
type UpdatePatternPayload struct {
	Target string   `json:"target"`
	Images []string `json:"images"`
}

// OpponentUpdatePayload: 相手側の状況更新通知用データ
type OpponentUpdatePayload struct {
	Images []string `json:"images"` // 相手の新しい画像
	Score  int      `json:"score"`  // 相手の現在のスコア
	Combo  int      `json:"combo"`  // 相手の現在のコンボ数
}

// ObstructionPayload: お邪魔攻撃発生時の通知データ
type ObstructionPayload struct {
	Effect     string `json:"effect"`      // お邪魔効果の種類 (SHAKE, SPINなど)
	AttackerID string `json:"attacker_id"` // 攻撃者のID
}

// GameResultPayload: ゲーム終了時の結果通知データ
type GameResultPayload struct {
	WinnerID string `json:"winner_id"` // 勝者のID
	Message  string `json:"message"`   // メッセージ
}

// SelectImagePayload: リアルタイムで選択中の画像を同期するためのデータ
type SelectImagePayload struct {
	RoomID     string `json:"room_id"`
	PlayerID   string `json:"player_id"`
	ImageIndex int    `json:"image_index"`
}

// ---------------------------------------------------------------------
// グローバル変数と定数
// ---------------------------------------------------------------------

var (
	// roomStates: 各部屋のゲーム進行状況を管理するマップ
	// キー: RoomID -> 値: (PlayerID -> PlayerState)
	roomStates = make(map[string]map[string]*PlayerState)

	// roomWinningScores: 各部屋ごとの勝利条件スコアを保持
	roomWinningScores = make(map[string]int)

	// upgrader: HTTPリクエストをWebSocket通信にアップグレードするための設定
	// CheckOriginですべてのオリジンからの接続を許可しています（CORS対策）
	upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

	// clients: WebSocket接続とプレイヤーIDの紐付け管理
	clients = make(map[*websocket.Conn]string)

	// rooms: 部屋ごとの接続リスト管理
	// キー: RoomID -> 値: (WebSocket接続 -> 存在フラグ)
	rooms = make(map[string]map[*websocket.Conn]bool)

	// mu: データの競合（レースコンディション）を防ぐための排他制御用ロック
	mu sync.Mutex

	// waitingRoomID: ランダムマッチング待ちの部屋IDを一時保存する変数
	waitingRoomID string

	// matchMu: マッチング処理専用の排他制御用ロック
	matchMu sync.Mutex
)

// allImages: ゲームで使用する画像のパスリスト
var allImages = []string{
	"/images/car1.jpg", "/images/car2.jpg", "/images/car3.jpg", "/images/car4.jpg", "/images/car5.jpg",
	"/images/shingouki1.jpg", "/images/shingouki2.jpg", "/images/shingouki3.jpg", "/images/shingouki4.jpg",
	"/images/kaidan0.jpg", "/images/kaidan1.jpg", "/images/kaidan2.jpg",
	"/images/shoukasen0.jpg", "/images/shoukasen1.jpg", "/images/shoukasen2.jpg",
	"/images/tamanegi5.png",
}

// targets: 出題されるお題のリスト
var targets = []string{"車", "信号機", "階段", "消火栓"}

// effects: お邪魔攻撃のエフェクト種類定義
var effects = []string{"SHAKE", "SPIN", "BLUR", "INVERT", "ONION_RAIN"}

// init: アプリケーション起動時の初期化処理
func init() {
	// 乱数のシード値を現在時刻で設定（毎回違うランダムパターンにするため）
	rand.Seed(time.Now().UnixNano())
}

// getEnv: 環境変数を取得するヘルパー関数。存在しない場合はfallback値を返す
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

// ---------------------------------------------------------------------
// WebSocket関連処理
// ---------------------------------------------------------------------

// cleanupClient: クライアント切断時や退出時のリソース解放処理
func cleanupClient(ws *websocket.Conn) {
	mu.Lock()         // データの整合性を保つためロック開始
	defer mu.Unlock() // 関数終了時にロック解除

	playerID, exists := clients[ws]
	if !exists {
		return
	}
	delete(clients, ws) // クライアント一覧から削除

	// 所属していた部屋を探して削除処理を行う
	for rid, conns := range rooms {
		if _, ok := conns[ws]; ok {
			delete(conns, ws) // 部屋の接続リストから削除
			// プレイヤーの状態データも削除
			if states, okState := roomStates[rid]; okState && exists {
				delete(states, playerID)
			}

			// 対戦相手が残されている場合の処理（不戦勝判定）
			if len(conns) > 0 {
				for remainingWs := range conns {
					if remainingPID, ok := clients[remainingWs]; ok {
						// 勝利通知を作成
						res := GameResultPayload{
							WinnerID: remainingPID,
							Message:  "Opponent Disconnected", // 相手の切断による勝利
						}
						b, _ := json.Marshal(res)

						// 残っているプレイヤーに通知
						remainingWs.WriteJSON(Message{Type: "GAME_FINISHED", Payload: b})
					}
				}
			}

			// 誰もいなくなった部屋は完全に削除してメモリ解放
			if len(conns) == 0 {
				delete(rooms, rid)
				delete(roomStates, rid)
				delete(roomWinningScores, rid)

				// もし待機中の部屋だった場合は、待機状態を解除
				matchMu.Lock()
				if waitingRoomID == rid {
					waitingRoomID = ""
				}
				matchMu.Unlock()
			}
		}
	}
}

// handleWebSocket: WebSocket接続のエントリーポイント
// HTTPリクエストをWebSocketにアップグレードし、メッセージ受信ループを開始する
func handleWebSocket(c echo.Context) error {
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close() // 関数終了時に接続を閉じる

	// 切断時に必ずクリーンアップを実行
	defer cleanupClient(ws)

	// メッセージ受信ループ
	for {
		var msg Message
		// JSONメッセージを読み込む
		if err := ws.ReadJSON(&msg); err != nil {
			// エラー（切断など）があればループを抜けて終了処理へ
			break
		}
		// メッセージの内容に応じた処理を実行
		handleMessage(ws, msg)
	}
	return nil
}

// handleMessage: 受信したメッセージの種類(Type)に応じて処理を振り分ける
func handleMessage(ws *websocket.Conn, msg Message) {
	switch msg.Type {
	case "JOIN_ROOM":
		// ----------------------------------------------------
		// 部屋への参加・マッチング要求
		// ----------------------------------------------------
		var p JoinRoomPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		actualRoomID := p.RoomID
		// "RANDOM" 指定の場合は自動マッチングロジックを実行
		if p.RoomID == "RANDOM" {
			matchMu.Lock()
			if waitingRoomID == "" {
				// 待機部屋がなければ新しくIDを生成して待機状態にする
				waitingRoomID = "ROOM_" + strconv.FormatInt(time.Now().UnixNano(), 10)
			}
			actualRoomID = waitingRoomID // 待機中の部屋に入る
			matchMu.Unlock()
		}

		mu.Lock()
		clients[ws] = p.PlayerID
		// 部屋データが存在しなければ新規作成
		if rooms[actualRoomID] == nil {
			rooms[actualRoomID] = make(map[*websocket.Conn]bool)
			roomStates[actualRoomID] = make(map[string]*PlayerState)

			// 勝利スコアの設定（指定がなければデフォルト5点）
			score := p.WinningScore
			if score <= 0 {
				score = 5
			}
			roomWinningScores[actualRoomID] = score
		}
		rooms[actualRoomID][ws] = true

		// プレイヤーの初期状態を設定
		if _, exists := roomStates[actualRoomID][p.PlayerID]; !exists {
			roomStates[actualRoomID][p.PlayerID] = &PlayerState{
				Score: 0,
				Combo: 0,
			}
		}

		roomSize := len(rooms[actualRoomID])
		mu.Unlock()

		// クライアントへ「部屋が決まった」と通知
		assigned := RoomAssignedPayload{RoomID: actualRoomID, PlayerID: p.PlayerID}
		b, _ := json.Marshal(assigned)

		// 同時書き込みを防ぐためロックして送信
		mu.Lock()
		ws.WriteJSON(Message{Type: "ROOM_ASSIGNED", Payload: b})
		mu.Unlock()

		// 2人揃ったらゲーム開始処理へ
		if roomSize == 2 {
			// ランダムマッチング完了時は待機IDをクリア
			if p.RoomID == "RANDOM" || waitingRoomID == actualRoomID {
				matchMu.Lock()
				if waitingRoomID == actualRoomID {
					waitingRoomID = ""
				}
				matchMu.Unlock()
			}
			startGame(actualRoomID)
		} else {
			// まだ1人の場合は待機通知
			mu.Lock()
			ws.WriteJSON(Message{Type: "STATUS_UPDATE", Payload: json.RawMessage(`{"status": "waiting_for_opponent"}`)})
			mu.Unlock()
		}

	case "LEAVE_ROOM":
		// ----------------------------------------------------
		// 退出要求（キャンセルボタンなど）
		// ----------------------------------------------------
		cleanupClient(ws)

	case "SELECT_IMAGE":
		// ----------------------------------------------------
		// 画像選択（リアルタイム同期用）
		// ----------------------------------------------------
		var p SelectImagePayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		// 部屋内の他のプレイヤーへ「相手が選択した」と通知
		broadcastToRoom(p.RoomID, Message{Type: "OPPONENT_SELECT", Payload: msg.Payload})

	case "VERIFY":
		// ----------------------------------------------------
		// 「確認」ボタン押下時の正解判定・ゲーム進行
		// ----------------------------------------------------
		var p VerifyPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		mu.Lock() // 状態更新のためロック
		states, okRoom := roomStates[p.RoomID]
		if !okRoom {
			mu.Unlock()
			return
		}
		state, okPlayer := states[p.PlayerID]
		if !okPlayer {
			mu.Unlock()
			return
		}

		// 勝利条件スコアを取得
		winningScore := roomWinningScores[p.RoomID]
		if winningScore <= 0 {
			winningScore = 5
		}

		// 既にゲーム終了スコアに達している場合は処理しない
		if state.Score >= winningScore {
			mu.Unlock()
			return
		}

		// --- 正解判定ロジック開始 ---
		// お題に対応する検索キーワード（ファイル名に含まれる文字列）を決定
		searchKey := ""
		switch state.Target {
		case "車":
			searchKey = "car"
		case "信号機":
			searchKey = "shingouki"
		case "階段":
			searchKey = "kaidan"
		case "消火栓":
			searchKey = "shoukasen"
		}

		// 現在表示されている画像リストから、正解（キーワードを含む）のインデックスを特定
		correctIndices := []int{}
		for i, img := range state.Images {
			if strings.Contains(strings.ToLower(img), searchKey) {
				correctIndices = append(correctIndices, i)
			}
		}

		// ユーザーの回答と正解リストを比較
		isCorrect := true
		if len(p.SelectedIndices) != len(correctIndices) {
			isCorrect = false // 個数が合わなければ不正解
		} else {
			// 選択されたインデックスがすべて正解リストに含まれているか確認
			selectionMap := make(map[int]bool)
			for _, idx := range p.SelectedIndices {
				selectionMap[idx] = true
			}
			for _, correctIdx := range correctIndices {
				if !selectionMap[correctIdx] {
					isCorrect = false
					break
				}
			}
		}

		if isCorrect {
			// --- 正解時の処理 ---
			state.Score++ // スコア加算
			state.Combo++ // コンボ加算
			currentScore := state.Score
			currentCombo := state.Combo

			// 勝利判定
			if currentScore >= winningScore {
				mu.Unlock()
				res := GameResultPayload{WinnerID: p.PlayerID, Message: "You are Human!"}
				b, _ := json.Marshal(res)
				// 全員にゲーム終了を通知
				broadcastToRoom(p.RoomID, Message{Type: "GAME_FINISHED", Payload: b})
				return
			}

			// 次の問題を生成（前回と同じお題にならないようにする）
			newTarget, newImages := generateProblem(state.Target)
			state.Target = newTarget
			state.Images = newImages

			// ロック解除後の送信データの準備
			targetToSend := newTarget
			imagesToSend := newImages

			sendObstruction := false
			// 2コンボ以上でお邪魔攻撃を発動
			if currentCombo >= 2 {
				state.Combo = 0 // コンボを消費（リセット）
				sendObstruction = true
			}
			comboToSend := state.Combo // 相手に送るコンボ数

			mu.Unlock() // 状態更新完了、ロック解除

			// 自分自身に次の問題を送信
			updateMy := UpdatePatternPayload{Target: targetToSend, Images: imagesToSend}
			bMy, _ := json.Marshal(updateMy)

			mu.Lock()
			ws.WriteJSON(Message{Type: "UPDATE_PATTERN", Payload: bMy})
			mu.Unlock()

			// 相手プレイヤーに「自分のスコア・盤面・コンボ数」を送信
			updateOpp := OpponentUpdatePayload{
				Images: imagesToSend,
				Score:  currentScore,
				Combo:  comboToSend,
			}
			bOpp, _ := json.Marshal(updateOpp)
			broadcastToOpponent(p.RoomID, p.PlayerID, Message{Type: "OPPONENT_UPDATE", Payload: bOpp})

			// お邪魔攻撃の実行（全員に通知）
			if sendObstruction {
				effect := effects[rand.Intn(len(effects))] // 効果をランダム選択
				obs := ObstructionPayload{Effect: effect, AttackerID: p.PlayerID}
				bObs, _ := json.Marshal(obs)
				broadcastToRoom(p.RoomID, Message{Type: "OBSTRUCTION", Payload: bObs})
			}

		} else {
			// --- 不正解時の処理 ---
			state.Combo = 0 // コンボリセット
			mu.Unlock()     // ロック解除

			// 不正解通知を送信（クライアント側でエラー表示などを行う）
			mu.Lock()
			ws.WriteJSON(Message{Type: "VERIFY_FAILED", Payload: json.RawMessage(`{}`)})
			mu.Unlock()
		}
	}
}

// ---------------------------------------------------------------------
// ゲームロジック・ヘルパー関数
// ---------------------------------------------------------------------

// generateProblem: 新しい問題（お題と9枚の画像セット）を生成する
// prevTarget: 直前のお題（これと被らないお題を選ぶ）
func generateProblem(prevTarget string) (string, []string) {
	// 前回と違うお題が出るまでランダム選択
	var target string
	for {
		target = targets[rand.Intn(len(targets))]
		if target != prevTarget {
			break
		}
	}

	// お題に対応するキーワード設定
	searchKey := ""
	switch target {
	case "車":
		searchKey = "car"
	case "信号機":
		searchKey = "shingouki"
	case "階段":
		searchKey = "kaidan"
	case "消火栓":
		searchKey = "shoukasen"
	}

	var corrects []string
	var others []string

	// 全画像プールから正解画像と不正解画像を分類
	for _, img := range allImages {
		if strings.Contains(strings.ToLower(img), searchKey) {
			corrects = append(corrects, img)
		} else {
			others = append(others, img)
		}
	}

	// ランダム性を高めるためシャッフル
	rand.Shuffle(len(corrects), func(i, j int) { corrects[i], corrects[j] = corrects[j], corrects[i] })
	rand.Shuffle(len(others), func(i, j int) { others[i], others[j] = others[j], others[i] })

	selected := []string{}

	// 正解画像を最大3枚まで選択
	correctCount := 3
	if len(corrects) < 3 {
		correctCount = len(corrects)
	}
	selected = append(selected, corrects[:correctCount]...)

	// 残りの枠を不正解画像（または余った正解画像）で埋める
	remaining := append(others, corrects[correctCount:]...)
	rand.Shuffle(len(remaining), func(i, j int) { remaining[i], remaining[j] = remaining[j], remaining[i] })

	needed := 9 - len(selected)
	if len(remaining) < needed {
		// 画像が足りない場合はあるだけ追加（エラー回避）
		selected = append(selected, remaining...)
	} else {
		selected = append(selected, remaining[:needed]...)
	}

	// 最終的に選ばれた9枚の並び順をシャッフル
	rand.Shuffle(len(selected), func(i, j int) { selected[i], selected[j] = selected[j], selected[i] })

	return target, selected
}

// startGame: 2人揃った部屋でゲームを開始する処理
func startGame(roomID string) {
	mu.Lock()
	defer mu.Unlock()

	conns := rooms[roomID]

	// 人数が減っている場合は開始しない（競合対策）
	if len(conns) < 2 {
		return
	}

	states := roomStates[roomID]

	// 勝利スコア設定の取得
	limit := roomWinningScores[roomID]
	if limit <= 0 {
		limit = 5
	}

	// 各プレイヤーの初期問題を生成・状態リセット
	for pid, state := range states {
		// 初回問題生成
		t, i := generateProblem("")
		state.Target = t
		state.Images = i
		state.Score = 0
		state.Combo = 0
		states[pid] = state
	}

	// 部屋内の全員に「ゲーム開始」を通知
	for ws := range conns {
		myID := clients[ws]
		myState := states[myID]

		// 相手の現在の画像を取得（プレビュー表示用）
		var opponentImages []string
		for pid, s := range states {
			if pid != myID {
				opponentImages = s.Images
				break
			}
		}

		payload := GameStartPayload{
			Target:         myState.Target,
			Images:         myState.Images,
			OpponentImages: opponentImages,
			WinningScore:   limit,
		}
		b, _ := json.Marshal(payload)
		ws.WriteJSON(Message{Type: "GAME_START", Payload: b})
	}
}

// broadcastToRoom: 指定した部屋の全クライアントにメッセージを送信
func broadcastToRoom(roomID string, msg Message) {
	mu.Lock()
	defer mu.Unlock()
	if conns, ok := rooms[roomID]; ok {
		for ws := range conns {
			ws.WriteJSON(msg)
		}
	}
}

// broadcastToOpponent: 指定した部屋の「自分以外」のクライアントにメッセージを送信
func broadcastToOpponent(roomID string, myPlayerID string, msg Message) {
	mu.Lock()
	defer mu.Unlock()
	if conns, ok := rooms[roomID]; ok {
		for ws := range conns {
			// IDを確認して自分以外なら送信
			if pid, ok := clients[ws]; ok && pid != myPlayerID {
				ws.WriteJSON(msg)
			}
		}
	}
}

// main: アプリケーションのエントリーポイント
func main() {
	e := echo.New()
	// ミドルウェア設定（ログ出力、リカバリー、CORS）
	e.Use(middleware.Logger(), middleware.Recover(), middleware.CORS())

	// ヘルスチェック用エンドポイント
	e.GET("/", func(c echo.Context) error { return c.String(http.StatusOK, "Backend Running") })

	// WebSocket用エンドポイント
	e.GET("/ws", handleWebSocket)

	// サーバー起動（ポートは環境変数PORT、または8080）
	e.Logger.Fatal(e.Start(":" + getEnv("PORT", "8080")))
}