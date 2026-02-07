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

// クライアントとやり取りする基本メッセージ形式
type Message struct {
	Type    string          `json:"type"`    // メッセージの種類 (例: "JOIN_ROOM", "VERIFY")
	Payload json.RawMessage `json:"payload"` // データの中身
}

// プレイヤー個別の状態管理（画像、お題、スコア、コンボ数）
type PlayerState struct {
	Images []string
	Target string
	Score  int
	Combo  int
}

// --- 以下、フロントエンドと送受信するデータの定義 (Payload) ---

type JoinRoomPayload struct {
	RoomID       string `json:"room_id"`
	PlayerID     string `json:"player_id"`
	WinningScore int    `json:"winning_score"` // 勝利に必要なスコア（設定用）
}

type RoomAssignedPayload struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
}

type VerifyPayload struct {
	RoomID          string `json:"room_id"`
	PlayerID        string `json:"player_id"`
	SelectedIndices []int  `json:"selected_indices"` // ユーザーが選んだ画像のインデックス
}

type GameStartPayload struct {
	Target         string   `json:"target"`
	Images         []string `json:"images"`
	OpponentImages []string `json:"opponent_images"` // 相手の画像（画面表示用）
	WinningScore   int      `json:"winning_score"`   // このゲームの勝利条件スコア
}

type UpdatePatternPayload struct {
	Target string   `json:"target"`
	Images []string `json:"images"`
}

type OpponentUpdatePayload struct {
	Images []string `json:"images"`
	Score  int      `json:"score"`
	Combo  int      `json:"combo"` // 追加: 相手のコンボ数
}

type ObstructionPayload struct {
	Effect     string `json:"effect"`      // お邪魔効果の種類 (SHAKE, SPINなど)
	AttackerID string `json:"attacker_id"` // 攻撃者のID
}

type GameResultPayload struct {
	WinnerID string `json:"winner_id"`
	Message  string `json:"message"`
}

type SelectImagePayload struct {
	RoomID     string `json:"room_id"`
	PlayerID   string `json:"player_id"`
	ImageIndex int    `json:"image_index"`
}

// --- グローバル変数定義 ---
var (
	// 各部屋のプレイヤー状態を保持するマップ: RoomID -> PlayerID -> State
	roomStates = make(map[string]map[string]*PlayerState)

	// 各部屋の勝利条件スコアを保持するマップ: RoomID -> WinningScore
	roomWinningScores = make(map[string]int)

	// WebSocketの設定（オリジン許可）
	upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

	// 接続管理用のマップ
	clients = make(map[*websocket.Conn]string)          // WebSocket接続 -> プレイヤーID
	rooms   = make(map[string]map[*websocket.Conn]bool) // 部屋ID -> 参加している接続リスト

	// 排他制御用ロック（データの競合を防ぐため）
	mu            sync.Mutex
	waitingRoomID string     // ランダムマッチ待ちの部屋ID
	matchMu       sync.Mutex // マッチング処理用のロック
)

// 画像プール（ここからランダムに出題）
var allImages = []string{
	"/images/car1.jpg", "/images/car2.jpg", "/images/car3.jpg", "/images/car4.jpg", "/images/car5.jpg",
	"/images/shingouki1.jpg", "/images/shingouki2.jpg", "/images/shingouki3.jpg", "/images/shingouki4.jpg",
	"/images/kaidan0.jpg", "/images/kaidan1.jpg", "/images/kaidan2.jpg",
	"/images/shoukasen0.jpg", "/images/shoukasen1.jpg", "/images/shoukasen2.jpg",
	"/images/tamanegi5.png",
}

// ターゲット（お題）リスト
var targets = []string{"車", "信号機", "階段", "消火栓"}

// お邪魔エフェクト定義
var effects = []string{"SHAKE", "SPIN", "BLUR", "INVERT", "ONION_RAIN"}

// 初期化処理
func init() {
	rand.Seed(time.Now().UnixNano()) // 乱数のシード値を現在時刻で設定
}

// 環境変数を取得するヘルパー関数（PORT設定などに使用）
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

// クライアントの切断・退出処理を共通化
// 通信が切れたり、部屋から退出した際にメモリを掃除する
func cleanupClient(ws *websocket.Conn) {
	mu.Lock() // データの変更中に他の処理が割り込まないようにロック
	playerID, exists := clients[ws]
	if !exists {
		mu.Unlock()
		return
	}
	delete(clients, ws) // クライアントリストから削除

	// 通知を送るべき相手とメッセージを一時保存するリスト
	type notification struct {
		conn *websocket.Conn
		msg  Message
	}
	var notifications []notification

	// 所属していた部屋を探して削除処理を行う
	for rid, conns := range rooms {
		if _, ok := conns[ws]; ok {
			delete(conns, ws) // 部屋の接続リストから削除
			// プレイヤー状態も削除
			if states, okState := roomStates[rid]; okState && exists {
				delete(states, playerID)
			}

			// 重要: 部屋にまだプレイヤーが残っている場合（対戦相手が残された場合）
			// 相手の切断による勝利（不戦勝）として処理する
			if len(conns) > 0 {
				for remainingWs := range conns {
					if remainingPID, ok := clients[remainingWs]; ok {
						// 勝利通知を準備
						res := GameResultPayload{
							WinnerID: remainingPID,
							Message:  "Opponent Disconnected",
						}
						b, _ := json.Marshal(res)
						notifications = append(notifications, notification{
							conn: remainingWs,
							msg:  Message{Type: "GAME_FINISHED", Payload: b},
						})
					}
				}
			}

			// 誰もいなくなった部屋は削除してメモリを解放
			if len(conns) == 0 {
				delete(rooms, rid)
				delete(roomStates, rid)
				delete(roomWinningScores, rid) // 設定も削除

				// 待機中の部屋だった場合は待機IDをクリア
				matchMu.Lock()
				if waitingRoomID == rid {
					waitingRoomID = ""
				}
				matchMu.Unlock()
			}
		}
	}
	mu.Unlock() // ここでロック解除（他の処理が動けるようにする）

	// ロックの外でメッセージ送信（デッドロック防止のため）
	for _, n := range notifications {
		n.conn.WriteJSON(n.msg)
	}
}

// WebSocket接続のエントリーポイント
func handleWebSocket(c echo.Context) error {
	// HTTP接続をWebSocket接続にアップグレード
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	// 関数終了時（切断時）にクリーンアップを実行
	defer cleanupClient(ws)

	// メッセージ受信ループ
	for {
		var msg Message
		if err := ws.ReadJSON(&msg); err != nil {
			break // エラー（切断など）があればループを抜ける
		}
		handleMessage(ws, msg)
	}
	return nil
}

// 受信したメッセージの種類に応じて処理を振り分ける
func handleMessage(ws *websocket.Conn, msg Message) {
	switch msg.Type {
	case "JOIN_ROOM": // 部屋への参加・マッチング要求
		var p JoinRoomPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		actualRoomID := p.RoomID
		// "RANDOM" 指定の場合は自動マッチングロジック
		if p.RoomID == "RANDOM" {
			matchMu.Lock()
			if waitingRoomID == "" {
				// 待機部屋がなければ新しく作る
				waitingRoomID = "ROOM_" + strconv.FormatInt(time.Now().UnixNano(), 10)
			}
			actualRoomID = waitingRoomID // 待機中の部屋に入る
			matchMu.Unlock()
		}

		mu.Lock()
		clients[ws] = p.PlayerID
		// 部屋データがなければ作成
		if rooms[actualRoomID] == nil {
			rooms[actualRoomID] = make(map[*websocket.Conn]bool)
			roomStates[actualRoomID] = make(map[string]*PlayerState)

			// 勝利スコアの設定（デフォルトは5）
			score := p.WinningScore
			if score <= 0 {
				score = 5
			}
			roomWinningScores[actualRoomID] = score
		}
		rooms[actualRoomID][ws] = true

		// プレイヤーの初期状態を設定
		roomStates[actualRoomID][p.PlayerID] = &PlayerState{
			Score: 0,
			Combo: 0,
		}

		roomSize := len(rooms[actualRoomID])
		mu.Unlock()

		// 「部屋が決まったよ」とクライアントに通知
		assigned := RoomAssignedPayload{RoomID: actualRoomID, PlayerID: p.PlayerID}
		b, _ := json.Marshal(assigned)
		ws.WriteJSON(Message{Type: "ROOM_ASSIGNED", Payload: b})

		// 2人揃ったらゲーム開始
		if roomSize == 2 {
			if p.RoomID == "RANDOM" || waitingRoomID == actualRoomID {
				matchMu.Lock()
				// マッチング成立したので待機IDをクリア
				if waitingRoomID == actualRoomID {
					waitingRoomID = ""
				}
				matchMu.Unlock()
			}
			startGame(actualRoomID) // ゲーム開始処理へ
		} else {
			// 1人の場合は待機通知
			ws.WriteJSON(Message{Type: "STATUS_UPDATE", Payload: json.RawMessage(`{"status": "waiting_for_opponent"}`)})
		}

	case "LEAVE_ROOM": // 退出要求
		// フロントエンドからキャンセルなどで退出要求があった場合
		cleanupClient(ws)

	case "SELECT_IMAGE": // 画像選択（リアルタイム同期用）
		var p SelectImagePayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		// 同じ部屋の相手に「あいつここ選んだぞ」と通知
		broadcastToRoom(p.RoomID, Message{Type: "OPPONENT_SELECT", Payload: msg.Payload})

	case "VERIFY": // 「確認」ボタンが押された時の正解判定
		var p VerifyPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		mu.Lock()
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
			winningScore = 5 // フォールバック
		}

		// 既に勝利点に達している場合は無視
		if state.Score >= winningScore {
			mu.Unlock()
			return
		}

		// 正解判定ロジック: 現在のお題から検索キーワードを決定
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

		// 正解画像のインデックスを特定
		correctIndices := []int{}
		for i, img := range state.Images {
			if strings.Contains(strings.ToLower(img), searchKey) {
				correctIndices = append(correctIndices, i)
			}
		}

		// ユーザーの回答と比較
		isCorrect := true
		if len(p.SelectedIndices) != len(correctIndices) {
			isCorrect = false // 数が合わなければ不正解
		} else {
			// 選んだ場所がすべて合っているか確認
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
			// 正解ならスコアとコンボを加算
			state.Score++
			state.Combo++
			currentScore := state.Score
			currentCombo := state.Combo

			// 設定された点数先取で勝利
			if currentScore >= winningScore {
				mu.Unlock()
				res := GameResultPayload{WinnerID: p.PlayerID, Message: "You are Human!"}
				b, _ := json.Marshal(res)
				// 部屋全体に終了通知
				broadcastToRoom(p.RoomID, Message{Type: "GAME_FINISHED", Payload: b})
				return
			}

			// 次の問題を生成（前回のお題と被らないようにする）
			newTarget, newImages := generateProblem(state.Target)
			state.Target = newTarget
			state.Images = newImages

			// ロックを解除する前に送信データを確保
			targetToSend := newTarget
			imagesToSend := newImages

			sendObstruction := false
			// 2コンボ以上でお邪魔攻撃フラグを立てる
			if currentCombo >= 2 {
				state.Combo = 0 // コンボ消費
				sendObstruction = true
			}
			
			// 相手に送るコンボ数（消費後は0を送る）
			comboToSend := state.Combo

			mu.Unlock() // 状態更新後にロック解除

			// 自分に次の問題を送信
			updateMy := UpdatePatternPayload{Target: targetToSend, Images: imagesToSend}
			bMy, _ := json.Marshal(updateMy)
			ws.WriteJSON(Message{Type: "UPDATE_PATTERN", Payload: bMy})

			// 相手に自分のスコアと新しい盤面（監視用）、そしてコンボ数を送信
			updateOpp := OpponentUpdatePayload{
				Images: imagesToSend, 
				Score:  currentScore,
				Combo:  comboToSend, // 追加
			}
			bOpp, _ := json.Marshal(updateOpp)
			broadcastToOpponent(p.RoomID, p.PlayerID, Message{Type: "OPPONENT_UPDATE", Payload: bOpp})

			// お邪魔攻撃を実行
			if sendObstruction {
				effect := effects[rand.Intn(len(effects))] // ランダムに効果を選択
				// 攻撃者IDをセット
				obs := ObstructionPayload{Effect: effect, AttackerID: p.PlayerID}
				bObs, _ := json.Marshal(obs)
				// 部屋全体に送信して、自分（攻撃者）も見れるようにする
				broadcastToRoom(p.RoomID, Message{Type: "OBSTRUCTION", Payload: bObs})
			}

		} else {
			// 不正解の場合
			state.Combo = 0 // コンボリセット
			mu.Unlock()     // ロック解除
			// 不正解通知を送信
			ws.WriteJSON(Message{Type: "VERIFY_FAILED", Payload: json.RawMessage(`{}`)})
		}
	}
}

// 新しい問題（お題と画像のセット）を生成する関数
// prevTarget: 前回のお題（これとは違うお題を選ぶ）
func generateProblem(prevTarget string) (string, []string) {
	// お題をランダム決定 (前回と違うものが出るまで繰り返す)
	var target string
	for {
		target = targets[rand.Intn(len(targets))]
		if target != prevTarget {
			break
		}
	}

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

	// 全画像から正解と不正解を分類
	for _, img := range allImages {
		if strings.Contains(strings.ToLower(img), searchKey) {
			corrects = append(corrects, img)
		} else {
			others = append(others, img)
		}
	}

	// シャッフル
	rand.Shuffle(len(corrects), func(i, j int) { corrects[i], corrects[j] = corrects[j], corrects[i] })
	rand.Shuffle(len(others), func(i, j int) { others[i], others[j] = others[j], others[i] })

	selected := []string{}

	// 正解画像を最大3枚まで選択
	correctCount := 3
	if len(corrects) < 3 {
		correctCount = len(corrects)
	}
	selected = append(selected, corrects[:correctCount]...)

	// 残りを不正解画像（または余った正解画像）で埋める
	remaining := append(others, corrects[correctCount:]...)
	rand.Shuffle(len(remaining), func(i, j int) { remaining[i], remaining[j] = remaining[j], remaining[i] })

	needed := 9 - len(selected)
	if len(remaining) < needed {
		selected = append(selected, remaining...)
	} else {
		selected = append(selected, remaining[:needed]...)
	}

	// 最終的な9枚をシャッフルして配置をランダムにする
	rand.Shuffle(len(selected), func(i, j int) { selected[i], selected[j] = selected[j], selected[i] })

	return target, selected
}

// ゲーム開始処理（2人揃った時）
func startGame(roomID string) {
	mu.Lock()
	defer mu.Unlock()

	conns := rooms[roomID]
	states := roomStates[roomID]

	// 勝利条件を取得
	limit := roomWinningScores[roomID]
	if limit <= 0 {
		limit = 5
	}

	// 各プレイヤーに最初の問題を生成・割り当て
	for pid, state := range states {
		// 初回なので前回のお題は無し("")
		t, i := generateProblem("")
		state.Target = t
		state.Images = i
		state.Score = 0
		state.Combo = 0
		states[pid] = state
	}

	// 全員に「ゲーム開始」メッセージを送信
	for ws := range conns {
		myID := clients[ws]
		myState := states[myID]

		// 相手の画像を取得（相手画面のプレビュー用）
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
			WinningScore:   limit, // 勝利条件を通知
		}
		b, _ := json.Marshal(payload)
		ws.WriteJSON(Message{Type: "GAME_START", Payload: b})
	}
}

// 部屋内の全員にメッセージを送る
func broadcastToRoom(roomID string, msg Message) {
	mu.Lock()
	defer mu.Unlock()
	if conns, ok := rooms[roomID]; ok {
		for ws := range conns {
			ws.WriteJSON(msg)
		}
	}
}

// 部屋内の「相手（自分以外）」にメッセージを送る
func broadcastToOpponent(roomID string, myPlayerID string, msg Message) {
	mu.Lock()
	defer mu.Unlock()
	if conns, ok := rooms[roomID]; ok {
		for ws := range conns {
			// 自分以外のプレイヤーIDを持つ接続を探して送信
			if pid, ok := clients[ws]; ok && pid != myPlayerID {
				ws.WriteJSON(msg)
			}
		}
	}
}

func main() {
	e := echo.New()
	e.Use(middleware.Logger(), middleware.Recover(), middleware.CORS())
	// サーバー稼働確認用
	e.GET("/", func(c echo.Context) error { return c.String(http.StatusOK, "Backend Running") })
	// WebSocketエンドポイント
	e.GET("/ws", handleWebSocket)
	// 8080ポートで起動
	e.Logger.Fatal(e.Start(":" + getEnv("PORT", "8080")))
}