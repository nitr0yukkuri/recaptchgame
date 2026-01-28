package main

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"os"
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

type VerifyPayload struct {
	RoomID          string `json:"room_id"`
	PlayerID        string `json:"player_id"`
	SelectedIndices []int  `json:"selected_indices"`
}

type JoinRoomPayload struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
}

type SelectImagePayload struct {
	RoomID     string `json:"room_id"`
	PlayerID   string `json:"player_id"`
	ImageIndex int    `json:"image_index"`
}

type GameStartPayload struct {
	ProblemID string   `json:"problem_id"`
	Images    []string `json:"images"`
	Target    string   `json:"target"`
}

type OpponentProgressPayload struct {
	PlayerID     string `json:"player_id"`
	CorrectCount int    `json:"correct_count"`
	TotalNeeded  int    `json:"total_needed"`
}

type GameResultPayload struct {
	WinnerID string `json:"winner_id"`
	Message  string `json:"message"`
}

var (
	scores      = make(map[string]int)
	roomImages  = make(map[string][]string)
	roomTargets = make(map[string]string)
	scoreMu     sync.Mutex
	upgrader    = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	clients     = make(map[*websocket.Conn]string)
	rooms       = make(map[string]map[*websocket.Conn]bool)
	mu          sync.Mutex
)

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
		delete(clients, ws)
		for rid, conns := range rooms {
			if _, ok := conns[ws]; ok {
				delete(conns, ws)
				if len(conns) == 0 {
					delete(rooms, rid)
					delete(roomImages, rid)
					delete(roomTargets, rid)
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
		mu.Lock()
		clients[ws] = p.PlayerID
		if rooms[p.RoomID] == nil {
			rooms[p.RoomID] = make(map[*websocket.Conn]bool)
		}
		rooms[p.RoomID][ws] = true
		roomSize := len(rooms[p.RoomID])
		mu.Unlock()

		if roomSize == 2 {
			scoreMu.Lock()
			for _, pid := range clients {
				scores[pid] = 0
			}
			scoreMu.Unlock()
			sendNewPattern(p.RoomID)
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
		currentImages, ok := roomImages[p.RoomID]
		currentTarget, okTarget := roomTargets[p.RoomID]
		mu.Unlock()

		if !ok || !okTarget {
			return
		}

		// 動的判定ロジック
		searchKey := strings.ToLower(currentTarget)
		if searchKey == "traffic light" {
			searchKey = "shingouki"
		}

		correctIndices := []int{}
		for i, img := range currentImages {
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

		scoreMu.Lock()
		if isCorrect {
			scores[p.PlayerID]++
		}
		currentScore := scores[p.PlayerID]
		scoreMu.Unlock()

		if currentScore >= 5 {
			res := GameResultPayload{WinnerID: p.PlayerID, Message: "You are Human!"}
			b, _ := json.Marshal(res)
			broadcastToRoom(p.RoomID, Message{Type: "GAME_FINISHED", Payload: b})
		} else {
			if isCorrect {
				prog := OpponentProgressPayload{PlayerID: p.PlayerID, CorrectCount: int(currentScore), TotalNeeded: 5}
				b, _ := json.Marshal(prog)
				broadcastToRoom(p.RoomID, Message{Type: "OPPONENT_PROGRESS", Payload: b})
				sendNewPattern(p.RoomID)
			} else {
				// 不正解時は何もしない（クライアント側は選択維持）
			}
		}
	}
}

func sendNewPattern(roomID string) {
	// タマネギを追加
	allImages := []string{
		"/images/car1.jpg", "/images/car2.jpg", "/images/car3.jpg", "/images/car4.jpg", "/images/car5.jpg",
		"/images/shingouki1.jpg", "/images/shingouki2.jpg", "/images/shingouki3.jpg", "/images/shingouki4.jpg",
		"/images/tamanegi5.png",
	}

	rand.Shuffle(len(allImages), func(i, j int) {
		allImages[i], allImages[j] = allImages[j], allImages[i]
	})
	selectedImages := allImages[:9]

	targets := []string{"CAR", "TRAFFIC LIGHT"}
	target := targets[rand.Intn(len(targets))]

	mu.Lock()
	roomImages[roomID] = selectedImages
	roomTargets[roomID] = target
	mu.Unlock()

	payload := GameStartPayload{ProblemID: "prob_" + time.Now().String(), Images: selectedImages, Target: target}
	b, _ := json.Marshal(payload)
	broadcastToRoom(roomID, Message{Type: "GAME_START", Payload: b})
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

func main() {
	e := echo.New()
	e.Use(middleware.Logger(), middleware.Recover(), middleware.CORS())
	e.GET("/", func(c echo.Context) error { return c.String(http.StatusOK, "Backend Running") })
	e.GET("/ws", handleWebSocket)
	e.Logger.Fatal(e.Start(":" + getEnv("PORT", "8080")))
}