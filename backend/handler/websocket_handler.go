package handler

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/gorilla/websocket"
	"recaptchgame-backend/domain"
	"recaptchgame-backend/usecase"
)

// WebSocketManager はWebSocket接続を管理
type WebSocketManager struct {
	mu             sync.RWMutex
	connections    map[string]*websocket.Conn // clientID -> conn
	clientToPlayer map[string]string          // clientID -> playerID
	clientToRoom   map[string]string          // clientID -> roomID
	roomToClients  map[string]map[string]bool // roomID -> map[clientID]bool
}

// NewWebSocketManager は新しいWebSocketManagerを生成
func NewWebSocketManager() *WebSocketManager {
	return &WebSocketManager{
		connections:    make(map[string]*websocket.Conn),
		clientToPlayer: make(map[string]string),
		clientToRoom:   make(map[string]string),
		roomToClients:  make(map[string]map[string]bool),
	}
}

// RegisterConnection はコネクションを登録
func (m *WebSocketManager) RegisterConnection(clientID string, conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connections[clientID] = conn
}

// UnregisterConnection はコネクションを解除
func (m *WebSocketManager) UnregisterConnection(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.connections, clientID)
	delete(m.clientToPlayer, clientID)
	roomID := m.clientToRoom[clientID]
	delete(m.clientToRoom, clientID)

	if roomID != "" && m.roomToClients[roomID] != nil {
		delete(m.roomToClients[roomID], clientID)
	}
}

// AssignClientToRoom はクライアントをルームに割り当て
func (m *WebSocketManager) AssignClientToRoom(clientID string, roomID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.clientToRoom[clientID] = roomID
	if m.roomToClients[roomID] == nil {
		m.roomToClients[roomID] = make(map[string]bool)
	}
	m.roomToClients[roomID][clientID] = true
}

// AssignClientToPlayer はクライアントにプレイヤーIDを紐付ける
func (m *WebSocketManager) AssignClientToPlayer(clientID string, playerID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clientToPlayer[clientID] = playerID
}

// GetConnection はコネクションを取得
func (m *WebSocketManager) GetConnection(clientID string) (*websocket.Conn, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	conn, ok := m.connections[clientID]
	return conn, ok
}

// GetConnectionsByRoomID はルーム内のコネクションを取得
func (m *WebSocketManager) GetConnectionsByRoomID(roomID string) map[string]*websocket.Conn {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]*websocket.Conn)
	if clients, ok := m.roomToClients[roomID]; ok {
		for clientID := range clients {
			if conn, ok := m.connections[clientID]; ok {
				result[clientID] = conn
			}
		}
	}
	return result
}

// GetConnectionsByRoomIDExcept はルーム内のコネクションを取得（特定クライアントを除く）
func (m *WebSocketManager) GetConnectionsByRoomIDExcept(roomID string, exceptClientID string) map[string]*websocket.Conn {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]*websocket.Conn)
	if clients, ok := m.roomToClients[roomID]; ok {
		for clientID := range clients {
			if clientID != exceptClientID {
				if conn, ok := m.connections[clientID]; ok {
					result[clientID] = conn
				}
			}
		}
	}
	return result
}

// GetRoomID はクライアントが属するルームIDを取得
func (m *WebSocketManager) GetRoomID(clientID string) (string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	roomID, ok := m.clientToRoom[clientID]
	return roomID, ok
}

// GetPlayerID はクライアントに紐付くプレイヤーIDを取得
func (m *WebSocketManager) GetPlayerID(clientID string) (string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	playerID, ok := m.clientToPlayer[clientID]
	return playerID, ok
}

// WebSocketHandler はWebSocket通信のハンドラー
type WebSocketHandler struct {
	wsManager      *WebSocketManager
	joinRoomUC     *usecase.JoinRoomUseCase
	verifyAnswerUC *usecase.VerifyAnswerUseCase
	startGameUC    *usecase.StartGameUseCase
	leaveRoomUC    *usecase.LeaveRoomUseCase
	roomRepo       domain.RoomRepository
}

// NewWebSocketHandler は新しいWebSocketHandlerを生成
func NewWebSocketHandler(
	wsManager *WebSocketManager,
	joinRoomUC *usecase.JoinRoomUseCase,
	verifyAnswerUC *usecase.VerifyAnswerUseCase,
	startGameUC *usecase.StartGameUseCase,
	leaveRoomUC *usecase.LeaveRoomUseCase,
	roomRepo domain.RoomRepository,
) *WebSocketHandler {
	return &WebSocketHandler{
		wsManager:      wsManager,
		joinRoomUC:     joinRoomUC,
		verifyAnswerUC: verifyAnswerUC,
		startGameUC:    startGameUC,
		leaveRoomUC:    leaveRoomUC,
		roomRepo:       roomRepo,
	}
}

// HandleConnection はWebSocket接続を処理
func (h *WebSocketHandler) HandleConnection(clientID string, conn *websocket.Conn) {
	h.wsManager.RegisterConnection(clientID, conn)
	defer func() {
		conn.Close()
		h.wsManager.UnregisterConnection(clientID)
	}()

	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			break
		}
		h.handleMessage(clientID, conn, msg)
	}
}

// handleMessage はメッセージを処理
func (h *WebSocketHandler) handleMessage(clientID string, conn *websocket.Conn, msg Message) {
	switch msg.Type {
	case "JOIN_ROOM":
		h.handleJoinRoom(clientID, conn, msg.Payload)
	case "LEAVE_ROOM":
		h.handleLeaveRoom(clientID, msg.Payload)
	case "SELECT_IMAGE":
		h.handleSelectImage(clientID, msg.Payload)
	case "VERIFY":
		h.handleVerify(clientID, conn, msg.Payload)
	}
}

// handleJoinRoom はJOIN_ROOMメッセージを処理
func (h *WebSocketHandler) handleJoinRoom(clientID string, conn *websocket.Conn, payload json.RawMessage) {
	var p JoinRoomPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return
	}

	input := usecase.JoinRoomInput{
		ClientID:     clientID,
		PlayerID:     p.PlayerID,
		RoomID:       p.RoomID,
		WinningScore: p.WinningScore,
	}

	output, err := h.joinRoomUC.Execute(input)
	if err != nil {
		return
	}

	// クライアントをルームに割り当て
	h.wsManager.AssignClientToPlayer(clientID, p.PlayerID)
	h.wsManager.AssignClientToRoom(clientID, output.ActualRoomID)

	// ROOM_ASSIGNED メッセージを送信
	assigned := RoomAssignedPayload{
		RoomID:   output.ActualRoomID,
		PlayerID: p.PlayerID,
	}
	b, _ := json.Marshal(assigned)
	conn.WriteJSON(Message{Type: "ROOM_ASSIGNED", Payload: b})

	// ルームが2人になったかチェック
	if output.RoomSize == 2 {
		// ゲーム開始
		startInput := usecase.StartGameInput{RoomID: output.ActualRoomID}
		startOutput, _ := h.startGameUC.Execute(startInput)

		// ルーム内全員にゲーム開始を通知
		room, _ := h.roomRepo.FindByID(output.ActualRoomID)
		players := []*domain.Player{room.Player1, room.Player2}
		gameStates := []*domain.GameState{room.GameState1, room.GameState2}

		for i, player := range players {
			if player == nil {
				continue
			}
			var opponentImages []string
			if i == 0 {
				opponentImages = gameStates[1].Images
			} else {
				opponentImages = gameStates[0].Images
			}

			gamePayload := GameStartPayload{
				Target:         gameStates[i].Target,
				Images:         gameStates[i].Images,
				OpponentImages: opponentImages,
				WinningScore:   startOutput.WinningScore,
			}
			b, _ := json.Marshal(gamePayload)

			// プレイヤーのコネクション全てに送信
			for cID, wsConn := range h.wsManager.connections {
				if playerID, _ := h.getPlayerIDByClientID(cID); playerID == player.ID {
					wsConn.WriteJSON(Message{Type: "GAME_START", Payload: b})
				}
			}
		}
	} else {
		// 相手を待機中
		conn.WriteJSON(Message{Type: "STATUS_UPDATE", Payload: json.RawMessage(`{"status": "waiting_for_opponent"}`)})
	}
}

// handleLeaveRoom はLEAVE_ROOMメッセージを処理
func (h *WebSocketHandler) handleLeaveRoom(clientID string, payload json.RawMessage) {
	var p LeaveRoomPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return
	}

	input := usecase.LeaveRoomInput{
		ClientID: clientID,
		PlayerID: p.PlayerID,
	}

	h.leaveRoomUC.Execute(input)

	// ルームの相手に通知
	roomID, ok := h.wsManager.GetRoomID(clientID)
	if ok {
		room, _ := h.roomRepo.FindByID(roomID)
		if room != nil {
			var opponentID string
			if room.Player1 != nil && room.Player1.ID != p.PlayerID {
				opponentID = room.Player1.ID
			} else if room.Player2 != nil && room.Player2.ID != p.PlayerID {
				opponentID = room.Player2.ID
			}

			if opponentID != "" {
				res := GameResultPayload{
					WinnerID: opponentID,
					Message:  "Opponent Disconnected",
				}
				b, _ := json.Marshal(res)

				for cID, conn := range h.wsManager.connections {
					if playerID, _ := h.getPlayerIDByClientID(cID); playerID == opponentID {
						conn.WriteJSON(Message{Type: "GAME_FINISHED", Payload: b})
					}
				}
			}
		}
	}
}

// handleSelectImage はSELECT_IMAGEメッセージを処理
func (h *WebSocketHandler) handleSelectImage(clientID string, payload json.RawMessage) {
	var p SelectImagePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return
	}

	// ルームの相手に通知
	roomID, ok := h.wsManager.GetRoomID(clientID)
	if ok {
		for cID, conn := range h.wsManager.GetConnectionsByRoomIDExcept(roomID, clientID) {
			if cID != clientID {
				conn.WriteJSON(Message{Type: "OPPONENT_SELECT", Payload: payload})
			}
		}
	}
}

// handleVerify はVERIFYメッセージを処理
func (h *WebSocketHandler) handleVerify(clientID string, conn *websocket.Conn, payload json.RawMessage) {
	var p VerifyPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return
	}

	input := usecase.VerifyAnswerInput{
		RoomID:          p.RoomID,
		PlayerID:        p.PlayerID,
		SelectedIndices: p.SelectedIndices,
	}

	output, err := h.verifyAnswerUC.Execute(input)
	if err != nil {
		return
	}

	if output.IsCorrect {
		// 正解：自分に新しい問題を送信
		updateMy := UpdatePatternPayload{
			Target: output.NewTarget,
			Images: output.NewImages,
		}
		bMy, _ := json.Marshal(updateMy)
		conn.WriteJSON(Message{Type: "UPDATE_PATTERN", Payload: bMy})

		// 相手に状態更新を送信
		roomID, _ := h.wsManager.GetRoomID(clientID)
		if roomID != "" {
			updateOpp := OpponentUpdatePayload{
				Images: output.NewImages,
				Score:  output.CurrentScore,
				Combo:  output.CurrentCombo,
			}
			bOpp, _ := json.Marshal(updateOpp)

			for cID, wsConn := range h.wsManager.GetConnectionsByRoomIDExcept(roomID, clientID) {
				if cID != clientID {
					wsConn.WriteJSON(Message{Type: "OPPONENT_UPDATE", Payload: bOpp})
				}
			}

			// 妨害エフェクト送信
			if output.SendObstruction {
				obs := ObstructionPayload{
					Effect:     output.Effect,
					AttackerID: p.PlayerID,
				}
				bObs, _ := json.Marshal(obs)
				h.broadcastToRoom(roomID, Message{Type: "OBSTRUCTION", Payload: bObs})
			}
		}

		// ゲーム終了判定
		if output.IsGameOver {
			res := GameResultPayload{
				WinnerID: output.Winner,
				Message:  "You are Human!",
			}
			b, _ := json.Marshal(res)
			h.broadcastToRoom(roomID, Message{Type: "GAME_FINISHED", Payload: b})
		}
	} else {
		// 不正解
		conn.WriteJSON(Message{Type: "VERIFY_FAILED", Payload: json.RawMessage(`{}`)})
	}
}

// broadcastToRoom はルーム内全員にメッセージを送信
func (h *WebSocketHandler) broadcastToRoom(roomID string, msg Message) {
	for _, conn := range h.wsManager.GetConnectionsByRoomID(roomID) {
		conn.WriteJSON(msg)
	}
}

// getPlayerIDByClientID はクライアントIDからプレイヤーIDを取得（ここは改善可能）
func (h *WebSocketHandler) getPlayerIDByClientID(clientID string) (string, error) {
	if playerID, ok := h.wsManager.GetPlayerID(clientID); ok {
		return playerID, nil
	}
	return "", fmt.Errorf("player id not found for client %s", clientID)
}

// Message はWebSocketメッセージ
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// DTO (Data Transfer Object) 定義
type JoinRoomPayload struct {
	RoomID       string `json:"room_id"`
	PlayerID     string `json:"player_id"`
	WinningScore int    `json:"winning_score"`
}

type LeaveRoomPayload struct {
	PlayerID string `json:"player_id"`
}

type RoomAssignedPayload struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
}

type GameStartPayload struct {
	Target         string   `json:"target"`
	Images         []string `json:"images"`
	OpponentImages []string `json:"opponent_images"`
	WinningScore   int      `json:"winning_score"`
}

type VerifyPayload struct {
	RoomID          string `json:"room_id"`
	PlayerID        string `json:"player_id"`
	SelectedIndices []int  `json:"selected_indices"`
}

type UpdatePatternPayload struct {
	Target string   `json:"target"`
	Images []string `json:"images"`
}

type OpponentUpdatePayload struct {
	Images []string `json:"images"`
	Score  int      `json:"score"`
	Combo  int      `json:"combo"`
}

type SelectImagePayload struct {
	RoomID     string `json:"room_id"`
	PlayerID   string `json:"player_id"`
	ImageIndex int    `json:"image_index"`
}

type ObstructionPayload struct {
	Effect     string `json:"effect"`
	AttackerID string `json:"attacker_id"`
}

type GameResultPayload struct {
	WinnerID string `json:"winner_id"`
	Message  string `json:"message"`
}
