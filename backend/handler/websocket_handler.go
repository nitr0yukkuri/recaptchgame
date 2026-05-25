package handler

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"recaptchgame-backend/domain"
	"recaptchgame-backend/usecase"
)

var errSendQueueClosed = fmt.Errorf("send queue is closed")
var errSendQueueFull = fmt.Errorf("send queue is full")

type clientConnection struct {
	conn   *websocket.Conn
	send   chan Message
	mu     sync.Mutex
	closed bool
}

func newClientConnection(conn *websocket.Conn) *clientConnection {
	return &clientConnection{
		conn: conn,
		send: make(chan Message, 32),
	}
}

func (c *clientConnection) enqueue(msg Message) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return errSendQueueClosed
	}
	select {
	case c.send <- msg:
		return nil
	default:
		return errSendQueueFull
	}
}

func (c *clientConnection) close() {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	c.closed = true
	close(c.send)
	c.mu.Unlock()

	c.conn.Close()
}

// WebSocketManager はWebSocket接続を管理
type WebSocketManager struct {
	mu             sync.RWMutex
	connections    map[string]*clientConnection // clientID -> connection state
	clientToPlayer map[string]string            // clientID -> playerID
	clientToRoom   map[string]string            // clientID -> roomID
	roomToClients  map[string]map[string]bool   // roomID -> map[clientID]bool
	lastPongAt     map[string]time.Time
}

// NewWebSocketManager は新しいWebSocketManagerを生成
func NewWebSocketManager() *WebSocketManager {
	return &WebSocketManager{
		connections:    make(map[string]*clientConnection),
		clientToPlayer: make(map[string]string),
		clientToRoom:   make(map[string]string),
		roomToClients:  make(map[string]map[string]bool),
		lastPongAt:     make(map[string]time.Time),
	}
}

// RegisterConnection はコネクションを登録
func (m *WebSocketManager) RegisterConnection(clientID string, conn *websocket.Conn) {
	client := newClientConnection(conn)

	m.mu.Lock()
	m.connections[clientID] = client
	m.lastPongAt[clientID] = time.Now()
	m.mu.Unlock()

	go m.writePump(clientID, client)
}

// UnregisterConnection はコネクションを解除
func (m *WebSocketManager) UnregisterConnection(clientID string) {
	m.mu.Lock()
	client, ok := m.connections[clientID]
	if ok {
		delete(m.connections, clientID)
	}
	delete(m.clientToPlayer, clientID)
	roomID := m.clientToRoom[clientID]
	delete(m.clientToRoom, clientID)
	delete(m.lastPongAt, clientID)

	if roomID != "" && m.roomToClients[roomID] != nil {
		delete(m.roomToClients[roomID], clientID)
		// ルーム内に誰もいなくなったらマップを削除
		if len(m.roomToClients[roomID]) == 0 {
			delete(m.roomToClients, roomID)
		}
	}
	m.mu.Unlock()

	if ok {
		client.close()
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

// GetClientIDsByRoomIDExcept はルーム内のクライアントIDを取得（特定クライアントを除く）
func (m *WebSocketManager) GetClientIDsByRoomIDExcept(roomID string, exceptClientID string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []string
	if clients, ok := m.roomToClients[roomID]; ok {
		for clientID := range clients {
			if clientID != exceptClientID {
				result = append(result, clientID)
			}
		}
	}
	return result
}

// GetClientIDsByPlayerID はプレイヤーIDに紐づくクライアントIDを取得
func (m *WebSocketManager) GetClientIDsByPlayerID(playerID string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []string
	for clientID, mappedPlayerID := range m.clientToPlayer {
		if mappedPlayerID == playerID {
			result = append(result, clientID)
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

// TouchPong はクライアントの最終PONG時刻を更新
func (m *WebSocketManager) TouchPong(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.connections[clientID]; ok {
		m.lastPongAt[clientID] = time.Now()
	}
}

// IsPongTimedOut は最終PONGが閾値を超過しているか判定
func (m *WebSocketManager) IsPongTimedOut(clientID string, timeout time.Duration) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	last, ok := m.lastPongAt[clientID]
	if !ok {
		return true
	}
	return time.Since(last) > timeout
}

// SendToClient は指定クライアントにメッセージ送信キュー経由で送る
func (m *WebSocketManager) SendToClient(clientID string, msg Message) error {
	m.mu.RLock()
	client, ok := m.connections[clientID]
	m.mu.RUnlock()
	if !ok {
		return nil
	}

	if err := client.enqueue(msg); err != nil {
		if err == errSendQueueFull {
			m.UnregisterConnection(clientID)
		}
		return err
	}
	return nil
}

// SendToRoom はルーム内全員にメッセージ送信キュー経由で送る
func (m *WebSocketManager) SendToRoom(roomID string, msg Message) {
	m.mu.RLock()
	var targetIDs []string
	if clients, ok := m.roomToClients[roomID]; ok {
		for clientID := range clients {
			targetIDs = append(targetIDs, clientID)
		}
	}
	m.mu.RUnlock()

	for _, clientID := range targetIDs {
		_ = m.SendToClient(clientID, msg)
	}
}

func (m *WebSocketManager) writePump(clientID string, client *clientConnection) {
	for msg := range client.send {
		if err := client.conn.WriteJSON(msg); err != nil {
			break
		}
	}
	m.UnregisterConnection(clientID)
}

// WebSocketHandler はWebSocket通信のハンドラー
type WebSocketHandler struct {
	wsManager       *WebSocketManager
	joinRoomUC      *usecase.JoinRoomUseCase
	verifyAnswerUC  *usecase.VerifyAnswerUseCase
	startGameUC     *usecase.StartGameUseCase
	leaveRoomUC     *usecase.LeaveRoomUseCase
	roomRepo        domain.RoomRepository
	sessionMu       sync.Mutex
	sessionToPlayer map[string]string
	playerToSession map[string]string
	graceTimers     map[string]*time.Timer
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
		wsManager:       wsManager,
		joinRoomUC:      joinRoomUC,
		verifyAnswerUC:  verifyAnswerUC,
		startGameUC:     startGameUC,
		leaveRoomUC:     leaveRoomUC,
		roomRepo:        roomRepo,
		sessionToPlayer: make(map[string]string),
		playerToSession: make(map[string]string),
		graceTimers:     make(map[string]*time.Timer),
	}
}

// HandleConnection はWebSocket接続を処理
func (h *WebSocketHandler) HandleConnection(clientID string, conn *websocket.Conn) {
	h.wsManager.RegisterConnection(clientID, conn)
	go h.heartbeatPump(clientID)
	// left フラグで重複退出処理を防ぐ
	var left bool
	defer func() {
		if !left {
			playerID, err := h.getPlayerIDByClientID(clientID)
			if err == nil {
				h.scheduleGracefulLeave(playerID)
			}
		}
		h.wsManager.UnregisterConnection(clientID)
	}()

	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			break
		}
		// LEAVE_ROOMを明示的に受信した場合はフラグを立てる
		if msg.Type == "LEAVE_ROOM" {
			left = true
		}
		h.handleMessage(clientID, conn, msg)
	}
}

// handleMessage はメッセージを処理
func (h *WebSocketHandler) handleMessage(clientID string, conn *websocket.Conn, msg Message) {
	switch msg.Type {
	case "JOIN_ROOM":
		h.handleJoinRoom(clientID, conn, msg.Payload)
	case "PONG":
		h.wsManager.TouchPong(clientID)
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

	sessionID := p.SessionID
	if sessionID == "" {
		sessionID = p.PlayerID
	}
	h.bindSession(sessionID, p.PlayerID)
	h.cancelGracefulLeave(sessionID)

	// 既存参加中のプレイヤーが同一セッションで再接続した場合は、参加処理を再実行せず復帰のみ行う
	if room, err := h.roomRepo.FindByPlayerID(p.PlayerID); err == nil && room != nil {
		h.wsManager.AssignClientToPlayer(clientID, p.PlayerID)
		h.wsManager.AssignClientToRoom(clientID, room.ID)

		assigned := RoomAssignedPayload{RoomID: room.ID, PlayerID: p.PlayerID}
		bAssigned, _ := json.Marshal(assigned)
		_ = h.wsManager.SendToClient(clientID, Message{Type: "ROOM_ASSIGNED", Payload: bAssigned})

		// 復帰時はルーム状態を再送して同期
		if room.IsReady() {
			player := room.GetPlayerByID(p.PlayerID)
			gameState := room.GetGameStateByPlayerID(p.PlayerID)
			if player != nil && gameState != nil {
				var opponentImages []string
				var opponentScore int
				if room.Player1 != nil && room.Player1.ID == p.PlayerID && room.GameState2 != nil {
					opponentImages = room.GameState2.Images
					if room.Player2 != nil {
						opponentScore = room.Player2.Score
					}
				} else if room.GameState1 != nil {
					opponentImages = room.GameState1.Images
					if room.Player1 != nil {
						opponentScore = room.Player1.Score
					}
				}

				gamePayload := GameStartPayload{
					Target:               gameState.Target,
					Images:               gameState.Images,
					OpponentImages:       opponentImages,
					WinningScore:         room.WinningScore,
					MyCurrentScore:       player.Score,
					OpponentCurrentScore: opponentScore,
				}
				bGame, _ := json.Marshal(gamePayload)
				_ = h.wsManager.SendToClient(clientID, Message{Type: "GAME_START", Payload: bGame})

				oppPayload := OpponentUpdatePayload{Images: opponentImages, Score: 0, Combo: 0}
				if room.Player1 != nil && room.Player1.ID == p.PlayerID && room.Player2 != nil {
					oppPayload.Score = room.Player2.Score
					oppPayload.Combo = room.Player2.Combo
				} else if room.Player1 != nil {
					oppPayload.Score = room.Player1.Score
					oppPayload.Combo = room.Player1.Combo
				}
				bOpp, _ := json.Marshal(oppPayload)
				_ = h.wsManager.SendToClient(clientID, Message{Type: "OPPONENT_UPDATE", Payload: bOpp})
				return
			}
		}

		_ = h.wsManager.SendToClient(clientID, Message{Type: "STATUS_UPDATE", Payload: json.RawMessage(`{"status": "waiting_for_opponent"}`)})
		return
	}

	input := usecase.JoinRoomInput{
		ClientID:     clientID,
		PlayerID:     p.PlayerID,
		RoomID:       p.RoomID,
		WinningScore: p.WinningScore,
	}

	output, err := h.joinRoomUC.Execute(input)
	if err != nil || output == nil {
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
	_ = h.wsManager.SendToClient(clientID, Message{Type: "ROOM_ASSIGNED", Payload: b})

	// ルームが2人になったかチェック
	if output.RoomSize == 2 {
		// ゲーム開始
		startInput := usecase.StartGameInput{RoomID: output.ActualRoomID}
		startOutput, err := h.startGameUC.Execute(startInput)
		if err != nil {
			// 部屋の準備ができていない場合はゲームを開始しない
			return
		}

		// ルーム内全員にゲーム開始を通知
		room, err := h.roomRepo.FindByID(output.ActualRoomID)
		if err != nil {
			return
		}
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
				Target:               gameStates[i].Target,
				Images:               gameStates[i].Images,
				OpponentImages:       opponentImages,
				WinningScore:         startOutput.WinningScore,
				MyCurrentScore:       0,
				OpponentCurrentScore: 0,
			}
			b, _ := json.Marshal(gamePayload)

			for _, cID := range h.wsManager.GetClientIDsByPlayerID(player.ID) {
				_ = h.wsManager.SendToClient(cID, Message{Type: "GAME_START", Payload: b})
			}
		}
	} else {
		// 相手を待機中
		_ = h.wsManager.SendToClient(clientID, Message{Type: "STATUS_UPDATE", Payload: json.RawMessage(`{"status": "waiting_for_opponent"}`)})
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

	h.leaveAndNotify(input, "Opponent Disconnected")
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
		for _, cID := range h.wsManager.GetClientIDsByRoomIDExcept(roomID, clientID) {
			// 同一プレイヤーの別タブには送らない
			if pid, ok := h.wsManager.GetPlayerID(cID); ok {
				if pid == p.PlayerID {
					continue
				}
			}
			_ = h.wsManager.SendToClient(cID, Message{Type: "OPPONENT_SELECT", Payload: payload})
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
		// 正解：自分に新しい問題と現在のスコア/コンボを送信して同期
		updateMy := UpdatePatternPayload{
			Target:       output.NewTarget,
			Images:       output.NewImages,
			CurrentScore: output.CurrentScore,
			CurrentCombo: output.CurrentCombo,
		}
		bMy, _ := json.Marshal(updateMy)
		_ = h.wsManager.SendToClient(clientID, Message{Type: "UPDATE_PATTERN", Payload: bMy})

		// 相手に状態更新を送信
		roomID, _ := h.wsManager.GetRoomID(clientID)
		if roomID != "" {
			updateOpp := OpponentUpdatePayload{
				Images: output.NewImages,
				Score:  output.CurrentScore,
				Combo:  output.CurrentCombo,
			}
			bOpp, _ := json.Marshal(updateOpp)

			for _, cID := range h.wsManager.GetClientIDsByRoomIDExcept(roomID, clientID) {
				// 同一プレイヤーの別タブにはOPPONENT_UPDATEを送らない
				if pid, ok := h.wsManager.GetPlayerID(cID); ok {
					if pid == p.PlayerID {
						continue
					}
				}
				_ = h.wsManager.SendToClient(cID, Message{Type: "OPPONENT_UPDATE", Payload: bOpp})
			}

			// 妨害エフェクト送信: プレイヤー発の場合はランダムに1人の相手のみを標的にする
			if output.SendObstruction {
				// ルーム情報を取得して候補プレイヤーを抽出
				if roomObj, err := h.roomRepo.FindByID(roomID); err == nil && roomObj != nil {
					var candidates []string
					if roomObj.Player1 != nil && roomObj.Player1.ID != p.PlayerID {
						candidates = append(candidates, roomObj.Player1.ID)
					}
					if roomObj.Player2 != nil && roomObj.Player2.ID != p.PlayerID {
						candidates = append(candidates, roomObj.Player2.ID)
					}
					if len(candidates) > 0 {
						targetPlayer := candidates[rand.Intn(len(candidates))]
						obs := ObstructionPayload{
							Effect:     output.Effect,
							AttackerID: p.PlayerID,
						}
						bObs, _ := json.Marshal(obs)
						// 対象プレイヤーに紐づくクライアントへのみ送信
						for _, cID := range h.wsManager.GetClientIDsByPlayerID(targetPlayer) {
							_ = h.wsManager.SendToClient(cID, Message{Type: "OBSTRUCTION", Payload: bObs})
						}
						// 攻撃者には発動確認を送る（UI 表示用）
						confirm := ObstructionPayload{
							Effect:     output.Effect,
							AttackerID: p.PlayerID,
						}
						bConfirm, _ := json.Marshal(confirm)
						for _, cID := range h.wsManager.GetClientIDsByPlayerID(p.PlayerID) {
							_ = h.wsManager.SendToClient(cID, Message{Type: "OBSTRUCTION_FIRED", Payload: bConfirm})
						}
					} else {
						// fallback: ルーム内全員へ送信
						obs := ObstructionPayload{
							Effect:     output.Effect,
							AttackerID: p.PlayerID,
						}
						bObs, _ := json.Marshal(obs)
						h.broadcastToRoom(roomID, Message{Type: "OBSTRUCTION", Payload: bObs})
					}
				} else {
					// room が取れない場合は従来の broadcast を行う
					obs := ObstructionPayload{
						Effect:     output.Effect,
						AttackerID: p.PlayerID,
					}
					bObs, _ := json.Marshal(obs)
					h.broadcastToRoom(roomID, Message{Type: "OBSTRUCTION", Payload: bObs})
				}
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
		_ = h.wsManager.SendToClient(clientID, Message{Type: "VERIFY_FAILED", Payload: json.RawMessage(`{}`)})
	}
}

// broadcastToRoom はルーム内全員にメッセージを送信
func (h *WebSocketHandler) broadcastToRoom(roomID string, msg Message) {
	h.wsManager.SendToRoom(roomID, msg)
}

// getPlayerIDByClientID はクライアントIDからプレイヤーIDを取得（ここは改善可能）
func (h *WebSocketHandler) getPlayerIDByClientID(clientID string) (string, error) {
	if playerID, ok := h.wsManager.GetPlayerID(clientID); ok {
		return playerID, nil
	}
	return "", fmt.Errorf("player id not found for client %s", clientID)
}

func (h *WebSocketHandler) bindSession(sessionID string, playerID string) {
	h.sessionMu.Lock()
	defer h.sessionMu.Unlock()
	h.sessionToPlayer[sessionID] = playerID
	h.playerToSession[playerID] = sessionID
}

func (h *WebSocketHandler) getSessionIDByPlayerID(playerID string) string {
	h.sessionMu.Lock()
	defer h.sessionMu.Unlock()
	return h.playerToSession[playerID]
}

func (h *WebSocketHandler) cancelGracefulLeave(sessionID string) {
	h.sessionMu.Lock()
	defer h.sessionMu.Unlock()
	if t, ok := h.graceTimers[sessionID]; ok {
		t.Stop()
		delete(h.graceTimers, sessionID)
	}
}

func (h *WebSocketHandler) scheduleGracefulLeave(playerID string) {
	sessionID := h.getSessionIDByPlayerID(playerID)
	if sessionID == "" {
		h.leaveAndNotify(usecase.LeaveRoomInput{ClientID: "", PlayerID: playerID}, "Opponent Disconnected")
		return
	}

	h.sessionMu.Lock()
	if t, ok := h.graceTimers[sessionID]; ok {
		t.Stop()
	}
	h.graceTimers[sessionID] = time.AfterFunc(10*time.Second, func() {
		if currentSessionID := h.getSessionIDByPlayerID(playerID); currentSessionID != sessionID {
			h.sessionMu.Lock()
			delete(h.graceTimers, sessionID)
			h.sessionMu.Unlock()
			return
		}
		if len(h.wsManager.GetClientIDsByPlayerID(playerID)) > 0 {
			h.sessionMu.Lock()
			delete(h.graceTimers, sessionID)
			h.sessionMu.Unlock()
			return
		}
		h.leaveAndNotify(usecase.LeaveRoomInput{ClientID: "", PlayerID: playerID}, "Opponent Disconnected")
		h.sessionMu.Lock()
		delete(h.graceTimers, sessionID)
		h.sessionMu.Unlock()
	})
	h.sessionMu.Unlock()
}

func (h *WebSocketHandler) leaveAndNotify(input usecase.LeaveRoomInput, message string) {
	sessionID := h.getSessionIDByPlayerID(input.PlayerID)
	room, _ := h.roomRepo.FindByPlayerID(input.PlayerID)
	var opponentID string
	if room != nil {
		if room.Player1 != nil && room.Player1.ID != input.PlayerID {
			opponentID = room.Player1.ID
		} else if room.Player2 != nil && room.Player2.ID != input.PlayerID {
			opponentID = room.Player2.ID
		}
	}

	h.leaveRoomUC.Execute(input)

	if opponentID != "" {
		res := GameResultPayload{WinnerID: opponentID, Message: message}
		b, _ := json.Marshal(res)
		for _, cID := range h.wsManager.GetClientIDsByPlayerID(opponentID) {
			_ = h.wsManager.SendToClient(cID, Message{Type: "GAME_FINISHED", Payload: b})
		}
	}

	// sessionToPlayer から削除（メモリリーク防止）
	if sessionID != "" {
		h.sessionMu.Lock()
		delete(h.sessionToPlayer, sessionID)
		delete(h.playerToSession, input.PlayerID)
		h.sessionMu.Unlock()
	}
}

func (h *WebSocketHandler) heartbeatPump(clientID string) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if h.wsManager.IsPongTimedOut(clientID, 15*time.Second) {
			h.wsManager.UnregisterConnection(clientID)
			return
		}
		_ = h.wsManager.SendToClient(clientID, Message{Type: "PING", Payload: json.RawMessage(`{}`)})
	}
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
	SessionID    string `json:"session_id"`
}

type LeaveRoomPayload struct {
	PlayerID string `json:"player_id"`
}

type RoomAssignedPayload struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
}

type GameStartPayload struct {
	Target              string   `json:"target"`
	Images              []string `json:"images"`
	OpponentImages      []string `json:"opponent_images"`
	WinningScore        int      `json:"winning_score"`
	MyCurrentScore      int      `json:"my_current_score,omitempty"`
	OpponentCurrentScore int      `json:"opponent_current_score,omitempty"`
}

type VerifyPayload struct {
	RoomID          string `json:"room_id"`
	PlayerID        string `json:"player_id"`
	SelectedIndices []int  `json:"selected_indices"`
}

type UpdatePatternPayload struct {
	Target string   `json:"target"`
	Images []string `json:"images"`
	CurrentScore int `json:"current_score,omitempty"`
	CurrentCombo int `json:"current_combo,omitempty"`
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
