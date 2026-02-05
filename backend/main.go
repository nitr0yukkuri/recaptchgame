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

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// プレイヤー個別の状態管理
type PlayerState struct {
	Images []string
	Target string
	Score  int
	Combo  int
}

// ペイロード定義
type JoinRoomPayload struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
}

type RoomAssignedPayload struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
}

type VerifyPayload struct {
	RoomID          string `json:"room_id"`
	PlayerID        string `json:"player_id"`
	SelectedIndices []int  `json:"selected_indices"`
}

type GameStartPayload struct {
	Target         string   `json:"target"`
	Images         []string `json:"images"`
	OpponentImages []string `json:"opponent_images"`
}

type UpdatePatternPayload struct {
	Target string   `json:"target"`
	Images []string `json:"images"`
}

type OpponentUpdatePayload struct {
	Images []string `json:"images"`
	Score  int      `json:"score"`
}

type ObstructionPayload struct {
	Effect string `json:"effect"`
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

var (
	// RoomID -> PlayerID -> State
	roomStates = make(map[string]map[string]*PlayerState)

	upgrader      = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	clients       = make(map[*websocket.Conn]string)           // ws -> playerID
	rooms         = make(map[string]map[*websocket.Conn]bool)  // roomID -> ws set
	mu            sync.Mutex
	waitingRoomID string
	matchMu       sync.Mutex
)

// 画像プール
var allImages = []string{
	"/images/car1.jpg", "/images/car2.jpg", "/images/car3.jpg", "/images/car4.jpg", "/images/car5.jpg",
	"/images/shingouki1.jpg", "/images/shingouki2.jpg", "/images/shingouki3.jpg", "/images/shingouki4.jpg",
	"/images/kaidan0.jpg", "/images/kaidan1.jpg", "/images/kaidan2.jpg",
	"/images/shoukasen0.jpg", "/images/shoukasen1.jpg", "/images/shoukasen2.jpg",
	"/images/tamanegi5.png",
}

// ターゲット
var targets = []string{"車", "信号機", "階段", "消火栓"}

// お邪魔エフェクト定義
var effects = []string{"SHAKE", "SPIN", "BLUR", "INVERT", "ONION_RAIN"}

func init() {
	rand.Seed(time.Now().UnixNano())
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

// クライアントの切断・退出処理を共通化
func cleanupClient(ws *websocket.Conn) {
	mu.Lock()
	playerID, exists := clients[ws]
	if !exists {
		mu.Unlock()
		return
	}
	delete(clients, ws)

	// 通知を送るべき相手とメッセージを一時保存するリスト
	type notification struct {
		conn *websocket.Conn
		msg  Message
	}
	var notifications []notification

	// 部屋からの削除処理
	for rid, conns := range rooms {
		if _, ok := conns[ws]; ok {
			delete(conns, ws)
			// プレイヤー状態も削除
			if states, okState := roomStates[rid]; okState && exists {
				delete(states, playerID)
			}

			// 重要: 部屋にまだプレイヤーが残っている場合（対戦相手が残された場合）
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

			// 部屋が空になったら削除
			if len(conns) == 0 {
				delete(rooms, rid)
				delete(roomStates, rid)

				// 待機中の部屋だった場合は待機IDをクリア
				matchMu.Lock()
				if waitingRoomID == rid {
					waitingRoomID = ""
				}
				matchMu.Unlock()
			}
		}
	}
	mu.Unlock() // ここでロック解除

	// ロックの外でメッセージ送信（デッドロック防止）
	for _, n := range notifications {
		n.conn.WriteJSON(n.msg)
	}
}

func handleWebSocket(c echo.Context) error {
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	// 切断時にクリーンアップを実行
	defer cleanupClient(ws)

	for {
		var msg Message
		if err := ws.ReadJSON(&msg); err != nil {
			break
		}
		handleMessage(ws, msg)
	}
	return nil
}

func handleMessage(ws *websocket.Conn, msg Message) {
	switch msg.Type {
	case "JOIN_ROOM":
		var p JoinRoomPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		actualRoomID := p.RoomID
		// RANDOMの場合は自動マッチングロジック
		if p.RoomID == "RANDOM" {
			matchMu.Lock()
			if waitingRoomID == "" {
				waitingRoomID = "ROOM_" + strconv.FormatInt(time.Now().UnixNano(), 10)
			}
			actualRoomID = waitingRoomID
			matchMu.Unlock()
		}

		mu.Lock()
		clients[ws] = p.PlayerID
		if rooms[actualRoomID] == nil {
			rooms[actualRoomID] = make(map[*websocket.Conn]bool)
			roomStates[actualRoomID] = make(map[string]*PlayerState)
		}
		rooms[actualRoomID][ws] = true

		roomStates[actualRoomID][p.PlayerID] = &PlayerState{
			Score: 0,
			Combo: 0,
		}

		roomSize := len(rooms[actualRoomID])
		mu.Unlock()

		assigned := RoomAssignedPayload{RoomID: actualRoomID, PlayerID: p.PlayerID}
		b, _ := json.Marshal(assigned)
		ws.WriteJSON(Message{Type: "ROOM_ASSIGNED", Payload: b})

		if roomSize == 2 {
			if p.RoomID == "RANDOM" || waitingRoomID == actualRoomID {
				matchMu.Lock()
				if waitingRoomID == actualRoomID {
					waitingRoomID = ""
				}
				matchMu.Unlock()
			}
			startGame(actualRoomID)
		} else {
			ws.WriteJSON(Message{Type: "STATUS_UPDATE", Payload: json.RawMessage(`{"status": "waiting_for_opponent"}`)})
		}

	case "LEAVE_ROOM":
		// フロントエンドからキャンセルなどで退出要求があった場合
		cleanupClient(ws)

	case "SELECT_IMAGE":
		var p SelectImagePayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		broadcastToRoom(p.RoomID, Message{Type: "OPPONENT_SELECT", Payload: msg.Payload})

	case "VERIFY":
		var p VerifyPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		// 修正: ロック範囲を拡大して競合状態を防ぐ
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

		// 既に終了している場合は無視
		if state.Score >= 5 {
			mu.Unlock()
			return
		}

		// 正解判定ロジック
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

		correctIndices := []int{}
		for i, img := range state.Images {
			if strings.Contains(strings.ToLower(img), searchKey) {
				correctIndices = append(correctIndices, i)
			}
		}

		isCorrect := true
		if len(p.SelectedIndices) != len(correctIndices) {
			isCorrect = false
		} else {
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
			state.Score++
			state.Combo++
			currentScore := state.Score
			currentCombo := state.Combo

			if currentScore >= 5 {
				mu.Unlock()
				res := GameResultPayload{WinnerID: p.PlayerID, Message: "You are Human!"}
				b, _ := json.Marshal(res)
				broadcastToRoom(p.RoomID, Message{Type: "GAME_FINISHED", Payload: b})
				return
			}

			newTarget, newImages := generateProblem()
			state.Target = newTarget
			state.Images = newImages

			// 送信データを確保
			targetToSend := newTarget
			imagesToSend := newImages

			sendObstruction := false
			if currentCombo >= 2 {
				state.Combo = 0
				sendObstruction = true
			}

			mu.Unlock() // 状態更新後にロック解除

			updateMy := UpdatePatternPayload{Target: targetToSend, Images: imagesToSend}
			bMy, _ := json.Marshal(updateMy)
			ws.WriteJSON(Message{Type: "UPDATE_PATTERN", Payload: bMy})

			updateOpp := OpponentUpdatePayload{Images: imagesToSend, Score: currentScore}
			bOpp, _ := json.Marshal(updateOpp)
			broadcastToOpponent(p.RoomID, p.PlayerID, Message{Type: "OPPONENT_UPDATE", Payload: bOpp})

			if sendObstruction {
				effect := effects[rand.Intn(len(effects))]
				obs := ObstructionPayload{Effect: effect}
				bObs, _ := json.Marshal(obs)
				broadcastToOpponent(p.RoomID, p.PlayerID, Message{Type: "OBSTRUCTION", Payload: bObs})
			}

		} else {
			state.Combo = 0
			mu.Unlock() // ロック解除
			ws.WriteJSON(Message{Type: "VERIFY_FAILED", Payload: json.RawMessage(`{}`)})
		}
	}
}

func generateProblem() (string, []string) {
	target := targets[rand.Intn(len(targets))]
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

	for _, img := range allImages {
		if strings.Contains(strings.ToLower(img), searchKey) {
			corrects = append(corrects, img)
		} else {
			others = append(others, img)
		}
	}

	rand.Shuffle(len(corrects), func(i, j int) { corrects[i], corrects[j] = corrects[j], corrects[i] })
	rand.Shuffle(len(others), func(i, j int) { others[i], others[j] = others[j], others[i] })

	selected := []string{}

	correctCount := 3
	if len(corrects) < 3 {
		correctCount = len(corrects)
	}
	selected = append(selected, corrects[:correctCount]...)

	remaining := append(others, corrects[correctCount:]...)
	rand.Shuffle(len(remaining), func(i, j int) { remaining[i], remaining[j] = remaining[j], remaining[i] })

	needed := 9 - len(selected)
	if len(remaining) < needed {
		selected = append(selected, remaining...)
	} else {
		selected = append(selected, remaining[:needed]...)
	}

	rand.Shuffle(len(selected), func(i, j int) { selected[i], selected[j] = selected[j], selected[i] })

	return target, selected
}

func startGame(roomID string) {
	mu.Lock()
	defer mu.Unlock()

	conns := rooms[roomID]
	states := roomStates[roomID]

	for pid, state := range states {
		t, i := generateProblem()
		state.Target = t
		state.Images = i
		state.Score = 0
		state.Combo = 0
		states[pid] = state
	}

	for ws := range conns {
		myID := clients[ws]
		myState := states[myID]

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
		}
		b, _ := json.Marshal(payload)
		ws.WriteJSON(Message{Type: "GAME_START", Payload: b})
	}
}

func broadcastToRoom(roomID string, msg Message) {
	mu.Lock()
	defer mu.Unlock()
	if conns, ok := rooms[roomID]; ok {
		for ws := range conns {
			ws.WriteJSON(msg)
		}
	}
}

func broadcastToOpponent(roomID string, myPlayerID string, msg Message) {
	mu.Lock()
	defer mu.Unlock()
	if conns, ok := rooms[roomID]; ok {
		for ws := range conns {
			if pid, ok := clients[ws]; ok && pid != myPlayerID {
				ws.WriteJSON(msg)
			}
		}
	}
}

func main() {
	e := echo.New()
	e.Use(middleware.Logger(), middleware.Recover(), middleware.CORS())
	e.GET("/", func(c echo.Context) error { return c.String(http.StatusOK, "Backend Running") })
	e.GET("/ws", handleWebSocket)
	e.Logger.Fatal(e.Start(":" + getEnv("PORT", "8080")))
}