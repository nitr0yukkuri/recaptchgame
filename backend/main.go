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
	"/images/tamanegi5.png",
}

var targets = []string{"車", "信号機"}
var effects = []string{"SHAKE", "SPIN", "BLUR", "INVERT"}

func init() {
	rand.Seed(time.Now().UnixNano())
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func handleWebSocket(c echo.Context) error {
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	defer func() {
		mu.Lock()
		playerID, exists := clients[ws]
		delete(clients, ws)
		
		// 部屋からの削除処理
		for rid, conns := range rooms {
			if _, ok := conns[ws]; ok {
				delete(conns, ws)
				// プレイヤー状態も削除（必要なら）
				if states, okState := roomStates[rid]; okState && exists {
					delete(states, playerID)
				}
				
				if len(conns) == 0 {
					delete(rooms, rid)
					delete(roomStates, rid)
					
					matchMu.Lock()
					if waitingRoomID == rid {
						waitingRoomID = ""
					}
					matchMu.Unlock()
				}
			}
		}
		mu.Unlock()
	}()

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
		
		// プレイヤー状態初期化
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
			// ゲーム開始：全員にそれぞれの問題を配る
			startGame(actualRoomID)
		} else {
			ws.WriteJSON(Message{Type: "STATUS_UPDATE", Payload: json.RawMessage(`{"status": "waiting_for_opponent"}`)})
		}

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

		mu.Lock()
		states, okRoom := roomStates[p.RoomID]
		if !okRoom {
			mu.Unlock()
			return
		}
		state, okPlayer := states[p.PlayerID]
		mu.Unlock()

		if !okPlayer {
			return
		}

		// 正解判定
		searchKey := ""
		if state.Target == "車" {
			searchKey = "car"
		} else if state.Target == "信号機" {
			searchKey = "shingouki"
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
			mu.Lock()
			state.Score++
			state.Combo++
			currentScore := state.Score
			currentCombo := state.Combo
			mu.Unlock()

			// 勝利判定
			if currentScore >= 5 {
				res := GameResultPayload{WinnerID: p.PlayerID, Message: "You are Human!"}
				b, _ := json.Marshal(res)
				broadcastToRoom(p.RoomID, Message{Type: "GAME_FINISHED", Payload: b})
				return
			}

			// 新しい問題を生成
			newTarget, newImages := generateProblem()
			mu.Lock()
			state.Target = newTarget
			state.Images = newImages
			mu.Unlock()

			// 1. 自分に新しい画像を通知
			updateMy := UpdatePatternPayload{Target: newTarget, Images: newImages}
			bMy, _ := json.Marshal(updateMy)
			ws.WriteJSON(Message{Type: "UPDATE_PATTERN", Payload: bMy})

			// 2. 相手に「敵の画像更新＆スコア更新」を通知
			updateOpp := OpponentUpdatePayload{Images: newImages, Score: currentScore}
			bOpp, _ := json.Marshal(updateOpp)
			broadcastToOpponent(p.RoomID, p.PlayerID, Message{Type: "OPPONENT_UPDATE", Payload: bOpp})

			// 3. コンボ判定（2連以上）なら相手に妨害送信
			if currentCombo >= 2 {
				mu.Lock()
				state.Combo = 0 // コンボ消費
				mu.Unlock()

				effect := effects[rand.Intn(len(effects))]
				obs := ObstructionPayload{Effect: effect}
				bObs, _ := json.Marshal(obs)
				broadcastToOpponent(p.RoomID, p.PlayerID, Message{Type: "OBSTRUCTION", Payload: bObs})
			}

		} else {
			// 不正解
			mu.Lock()
			state.Combo = 0 // コンボリセット
			mu.Unlock()
			ws.WriteJSON(Message{Type: "VERIFY_FAILED", Payload: json.RawMessage(`{}`)})
		}
	}
}

func generateProblem() (string, []string) {
	rand.Shuffle(len(allImages), func(i, j int) {
		allImages[i], allImages[j] = allImages[j], allImages[i]
	})
	selected := make([]string, 9)
	copy(selected, allImages[:9])
	target := targets[rand.Intn(len(targets))]
	return target, selected
}

func startGame(roomID string) {
	mu.Lock()
	defer mu.Unlock()

	conns := rooms[roomID]
	states := roomStates[roomID]
	
	// 各プレイヤーの問題を生成
	for pid, state := range states {
		t, i := generateProblem()
		state.Target = t
		state.Images = i
		state.Score = 0
		state.Combo = 0
		// マップ内のポインタは更新済みだが念のため
		states[pid] = state
	}

	// 各クライアントに「自分の問題」と「相手の初期画像」を送る
	for ws := range conns {
		myID := clients[ws]
		myState := states[myID]
		
		// 相手を探す
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

// 自分以外のプレイヤーに送る
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