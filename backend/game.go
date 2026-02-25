package main

import (
	"encoding/json"
	"math/rand"
	"strings"
)

func generateProblem(prevTarget string) (string, []string) {
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
	if len(conns) < 2 {
		return
	}

	states := roomStates[roomID]

	limit := roomWinningScores[roomID]
	if limit <= 0 {
		limit = 5
	}

	for pid, state := range states {
		t, i := generateProblem("")
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
			WinningScore:   limit,
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
