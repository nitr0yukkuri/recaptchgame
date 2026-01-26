package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type SelectImagePayload struct {
	RoomID     string `json:"room_id"`
	PlayerID   string `json:"player_id"`
	ImageIndex int    `json:"image_index"`
}

type JoinRoomPayload struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
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
	scores   = make(map[string]int)
	scoreMu  sync.Mutex
	upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	clients  = make(map[*websocket.Conn]string)
	rooms    = make(map[string]map[*websocket.Conn]bool)
	mu       sync.Mutex
	ctx      = context.Background()
)

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
		playerID := clients[ws]
		delete(clients, ws)
		for rid, conns := range rooms {
			if _, ok := conns[ws]; ok {
				delete(conns, ws)
				if len(conns) == 0 {
					delete(rooms, rid)
				}
				fmt.Printf("Player %s disconnected from room %s\n", playerID, rid)
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
		log.Printf("Player %s joined room %s (Count: %d)", p.PlayerID, p.RoomID, roomSize)
		if roomSize == 2 {
			startGame(p.RoomID)
		} else {
			ws.WriteJSON(Message{Type: "STATUS_UPDATE", Payload: json.RawMessage(`{"status": "waiting_for_opponent"}`)})
		}
	case "SELECT_IMAGE":
		var p SelectImagePayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		scoreMu.Lock()
		// 正誤判定: 4番（コーヒー）以外は「車」として正解扱い
		isCorrect := p.ImageIndex != 4 

		if isCorrect {
			scores[p.PlayerID]++
		} else {
			scores[p.PlayerID]--
			if scores[p.PlayerID] < 0 {
				scores[p.PlayerID] = 0
			}
		}
		currentScore := scores[p.PlayerID]
		scoreMu.Unlock()

		if currentScore >= 5 {
			res := GameResultPayload{WinnerID: p.PlayerID, Message: "You are Human!"}
			b, _ := json.Marshal(res)
			broadcastToRoom(p.RoomID, Message{Type: "GAME_FINISHED", Payload: b})
		} else {
			prog := OpponentProgressPayload{PlayerID: p.PlayerID, CorrectCount: int(currentScore), TotalNeeded: 5}
			b, _ := json.Marshal(prog)
			broadcastToRoom(p.RoomID, Message{Type: "OPPONENT_PROGRESS", Payload: b})
		}
	}
}

func startGame(roomID string) {
	// 【修正】100%安定して表示されることが確認されている画像ID
	images := []string{
		"https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=300", // 0: Car
		"https://images.unsplash.com/photo-1503376763036-066120622c74?w=300", // 1: Car
		"https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=300", // 2: Car
		"https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=300", // 3: Car
		"https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300", // 4: Coffee (TRAP)
		"https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=300", // 5: Car
		"https://images.unsplash.com/photo-1542362567-b07e54358753?w=300", // 6: Car
		"https://images.unsplash.com/photo-1502877338535-766e1452684a?w=300", // 7: Car
		"https://images.unsplash.com/photo-1494905998402-395d579af905?w=300", // 8: Car
	}

	targetWord := "CARS"

	payload := GameStartPayload{ProblemID: "prob_cars_001", Images: images, Target: targetWord}
	b, _ := json.Marshal(payload)
	mu.Lock()
	if conns, ok := rooms[roomID]; ok {
		scoreMu.Lock()
		for ws := range conns {
			scores[clients[ws]] = 0
		}
		scoreMu.Unlock()
	}
	mu.Unlock()
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