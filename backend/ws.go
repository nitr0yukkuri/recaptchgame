package main

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

func cleanupClient(ws *websocket.Conn) {
	mu.Lock()
	defer mu.Unlock()

	playerID, exists := clients[ws]
	if !exists {
		return
	}
	delete(clients, ws)

	for rid, conns := range rooms {
		if _, ok := conns[ws]; ok {
			delete(conns, ws)
			if states, okState := roomStates[rid]; okState && exists {
				delete(states, playerID)
			}

			if len(conns) > 0 {
				for remainingWs := range conns {
					if remainingPID, ok := clients[remainingWs]; ok {
						res := GameResultPayload{
							WinnerID: remainingPID,
							Message:  "Opponent Disconnected",
						}
						b, _ := json.Marshal(res)
						remainingWs.WriteJSON(Message{Type: "GAME_FINISHED", Payload: b})
					}
				}
			}

			if len(conns) == 0 {
				delete(rooms, rid)
				delete(roomStates, rid)
				delete(roomWinningScores, rid)

				matchMu.Lock()
				if waitingRoomID == rid {
					waitingRoomID = ""
				}
				matchMu.Unlock()
			}
		}
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close()
	defer cleanupClient(ws)

	for {
		var msg Message
		if err := ws.ReadJSON(&msg); err != nil {
			break
		}
		handleMessage(ws, msg)
	}
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

			score := p.WinningScore
			if score <= 0 {
				score = 5
			}
			roomWinningScores[actualRoomID] = score
		}
		rooms[actualRoomID][ws] = true

		if _, exists := roomStates[actualRoomID][p.PlayerID]; !exists {
			roomStates[actualRoomID][p.PlayerID] = &PlayerState{
				Score: 0,
				Combo: 0,
			}
		}

		roomSize := len(rooms[actualRoomID])
		mu.Unlock()

		assigned := RoomAssignedPayload{RoomID: actualRoomID, PlayerID: p.PlayerID}
		b, _ := json.Marshal(assigned)

		mu.Lock()
		ws.WriteJSON(Message{Type: "ROOM_ASSIGNED", Payload: b})
		mu.Unlock()

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
			mu.Lock()
			ws.WriteJSON(Message{Type: "STATUS_UPDATE", Payload: json.RawMessage(`{"status": "waiting_for_opponent"}`)})
			mu.Unlock()
		}

	case "LEAVE_ROOM":
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

		winningScore := roomWinningScores[p.RoomID]
		if winningScore <= 0 {
			winningScore = 5
		}

		if state.Score >= winningScore {
			mu.Unlock()
			return
		}

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

			if currentScore >= winningScore {
				mu.Unlock()
				res := GameResultPayload{WinnerID: p.PlayerID, Message: "You are Human!"}
				b, _ := json.Marshal(res)
				broadcastToRoom(p.RoomID, Message{Type: "GAME_FINISHED", Payload: b})
				return
			}

			newTarget, newImages := generateProblem(state.Target)
			state.Target = newTarget
			state.Images = newImages

			targetToSend := newTarget
			imagesToSend := newImages

			sendObstruction := false
			if currentCombo >= 2 {
				state.Combo = 0
				sendObstruction = true
			}
			comboToSend := state.Combo

			mu.Unlock()

			updateMy := UpdatePatternPayload{Target: targetToSend, Images: imagesToSend}
			bMy, _ := json.Marshal(updateMy)

			mu.Lock()
			ws.WriteJSON(Message{Type: "UPDATE_PATTERN", Payload: bMy})
			mu.Unlock()

			updateOpp := OpponentUpdatePayload{
				Images: imagesToSend,
				Score:  currentScore,
				Combo:  comboToSend,
			}
			bOpp, _ := json.Marshal(updateOpp)
			broadcastToOpponent(p.RoomID, p.PlayerID, Message{Type: "OPPONENT_UPDATE", Payload: bOpp})

			if sendObstruction {
				effect := effects[rand.Intn(len(effects))]
				obs := ObstructionPayload{Effect: effect, AttackerID: p.PlayerID}
				bObs, _ := json.Marshal(obs)
				broadcastToRoom(p.RoomID, Message{Type: "OBSTRUCTION", Payload: bObs})
			}

		} else {
			state.Combo = 0
			mu.Unlock()

			mu.Lock()
			ws.WriteJSON(Message{Type: "VERIFY_FAILED", Payload: json.RawMessage(`{}`)})
			mu.Unlock()
		}
	}
}
