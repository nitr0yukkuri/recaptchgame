package handler

import (
	"encoding/json"
	"fmt"
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

// RemoveClientAssociation はクライアントのルーム/プレイヤー関連付けを解除する
func (m *WebSocketManager) RemoveClientAssociation(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	roomID := m.clientToRoom[clientID]
	delete(m.clientToRoom, clientID)
	delete(m.clientToPlayer, clientID)
	delete(m.lastPongAt, clientID)

	if roomID != "" && m.roomToClients[roomID] != nil {
		delete(m.roomToClients[roomID], clientID)
		if len(m.roomToClients[roomID]) == 0 {
			delete(m.roomToClients, roomID)
		}
	}
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

// CloseAll は全ての接続をクローズして登録を解除します。
func (m *WebSocketManager) CloseAll() {
	m.mu.RLock()
	ids := make([]string, 0, len(m.connections))
	for id := range m.connections {
		ids = append(ids, id)
	}
	m.mu.RUnlock()

	for _, id := range ids {
		m.UnregisterConnection(id)
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
				// get first opponent game state (if any)
				opponentGS := room.GetOpponentGameState(p.PlayerID)
				var opponentImages []string
				var opponentScore int
				if opponentGS != nil {
					opponentImages = opponentGS.Images
					// try to find opponent player to get score
					// iterate players
					if room.Player1 != nil && room.Player1.ID != p.PlayerID {
						opponentScore = room.Player1.Score
					} else if room.Player2 != nil && room.Player2.ID != p.PlayerID {
						opponentScore = room.Player2.Score
					} else {
						for _, op := range room.ExtraPlayers {
							if op != nil && op.ID != p.PlayerID {
								opponentScore = op.Score
								break
							}
						}
					}
				}

				brOpponents := h.buildBROpponentSnapshots(room, player.ID)
				if len(opponentImages) == 0 && len(brOpponents) > 0 {
					opponentImages = brOpponents[0].Images
					opponentScore = brOpponents[0].Score
				}
				gamePayload := GameStartPayload{
					Target:               gameState.Target,
					Images:               gameState.Images,
					OpponentImages:       opponentImages,
					WinningScore:         room.WinningScore,
					MyCurrentScore:       player.Score,
					OpponentCurrentScore: opponentScore,
					PlayerEffect:         player.ActiveEffect(),
					BROpponents:          brOpponents,
				}
				bGame, _ := json.Marshal(gamePayload)
				_ = h.wsManager.SendToClient(clientID, Message{Type: "GAME_START", Payload: bGame})

				oppPayload := OpponentUpdatePayload{Images: opponentImages, Score: opponentScore, Combo: 0, BROpponents: brOpponents}
				if len(brOpponents) > 0 {
					oppPayload.Score = brOpponents[0].Score
					oppPayload.Combo = brOpponents[0].Combo
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
		Capacity:     p.Capacity,
	}

	output, err := h.joinRoomUC.Execute(input)
	if err != nil || output == nil {
		// join に失敗したことをクライアントへ通知してUIが固まらないようにする
		errMsg := struct {
			Message string `json:"message"`
		}{Message: "JOIN_FAILED"}
		bErr, _ := json.Marshal(errMsg)
		_ = h.wsManager.SendToClient(clientID, Message{Type: "JOIN_FAILED", Payload: bErr})
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

	// ルームが参加可能人数に達したかチェック
	if output.RoomSize >= output.RoomCapacity {
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
		// build players and gameStates slices (player1, player2, extra...)
		players := []*domain.Player{room.Player1, room.Player2}
		gameStates := []*domain.GameState{room.GameState1, room.GameState2}
		for _, p := range room.ExtraPlayers {
			players = append(players, p)
		}
		for _, gs := range room.ExtraGameStates {
			gameStates = append(gameStates, gs)
		}

		for i, player := range players {
			if player == nil {
				continue
			}
			// find an opponent's images (first other player's images)
			var opponentImages []string
			for j := range gameStates {
				if j == i {
					continue
				}
				if gameStates[j] != nil {
					opponentImages = gameStates[j].Images
					break
				}
			}

			var myImages []string
			if i < len(gameStates) && gameStates[i] != nil {
				myImages = gameStates[i].Images
			}

			gamePayload := GameStartPayload{
				Target:               "",
				Images:               myImages,
				OpponentImages:       opponentImages,
				WinningScore:         startOutput.WinningScore,
				MyCurrentScore:       0,
				OpponentCurrentScore: 0,
				PlayerEffect:         player.ActiveEffect(),
				BROpponents:          h.buildBROpponentSnapshots(room, player.ID),
			}
			if len(gamePayload.BROpponents) > 0 {
				gamePayload.OpponentImages = gamePayload.BROpponents[0].Images
				gamePayload.OpponentCurrentScore = gamePayload.BROpponents[0].Score
			}
			// If we have a target for this slot, include it
			if i < len(gameStates) && gameStates[i] != nil {
				gamePayload.Target = gameStates[i].Target
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
		Target:          p.Target,
		SelectedIndices: p.SelectedIndices,
	}

	output, err := h.verifyAnswerUC.Execute(input)
	if err != nil || output == nil {
		return
	}

	if output.IsCorrect {
		// ゲーム終了判定を最優先で行う
		if output.IsGameOver {
			res := GameResultPayload{
				WinnerID: output.Winner,
				Message:  "You are Human!",
			}
			b, _ := json.Marshal(res)
			h.broadcastToRoom(p.RoomID, Message{Type: "GAME_FINISHED", Payload: b})
			if room, err := h.roomRepo.FindByID(p.RoomID); err == nil && room != nil {
				h.cleanupFinishedRoom(room)
			}
			return
		}

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
				Images:      output.NewImages,
				Score:       output.CurrentScore,
				Combo:       output.CurrentCombo,
				BROpponents: make([]BROpponentPayload, 0, len(output.BROpponents)),
			}
			for _, opp := range output.BROpponents {
				updateOpp.BROpponents = append(updateOpp.BROpponents, BROpponentPayload{
					PlayerID: opp.PlayerID,
					Target:   opp.Target,
					Images:   append([]string(nil), opp.Images...),
					Score:    opp.Score,
					Combo:    opp.Combo,
					Effect:   opp.Effect,
				})
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
				if output.TargetPlayer != "" {
					obs := ObstructionPayload{
						Effect:     output.Effect,
						AttackerID: p.PlayerID,
						TargetID:   output.TargetPlayer,
					}
					bObs, _ := json.Marshal(obs)
					h.broadcastToRoom(roomID, Message{Type: "OBSTRUCTION", Payload: bObs})
					confirm := ObstructionPayload{
						Effect:     output.Effect,
						AttackerID: p.PlayerID,
						TargetID:   output.TargetPlayer,
					}
					bConfirm, _ := json.Marshal(confirm)
					for _, cID := range h.wsManager.GetClientIDsByPlayerID(p.PlayerID) {
						_ = h.wsManager.SendToClient(cID, Message{Type: "OBSTRUCTION_FIRED", Payload: bConfirm})
					}
				}
			}
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
	h.cancelGracefulLeave(sessionID)
	room, _ := h.roomRepo.FindByPlayerID(input.PlayerID)
	var roomID string
	if room != nil {
		roomID = room.ID
	}
	clientIDs := h.wsManager.GetClientIDsByPlayerID(input.PlayerID)

	h.leaveRoomUC.Execute(input)

	for _, cID := range clientIDs {
		h.wsManager.RemoveClientAssociation(cID)
	}

	if roomID != "" {
		updatedRoom, err := h.roomRepo.FindByID(roomID)
		if err == nil && updatedRoom != nil {
			remaining := updatedRoom.CountPlayers()
			if remaining >= 2 {
				status := struct {
					Message          string `json:"message"`
					PlayerID         string `json:"player_id"`
					RemainingPlayers int    `json:"remaining_players"`
				}{Message: message, PlayerID: input.PlayerID, RemainingPlayers: remaining}
				b, _ := json.Marshal(status)
				h.broadcastToRoom(roomID, Message{Type: "STATUS_UPDATE", Payload: b})
			} else if remaining == 1 {
				var winnerID string
				if updatedRoom.Player1 != nil && updatedRoom.Player1.ID != "" {
					winnerID = updatedRoom.Player1.ID
				} else if updatedRoom.Player2 != nil && updatedRoom.Player2.ID != "" {
					winnerID = updatedRoom.Player2.ID
				} else {
					for _, p := range updatedRoom.ExtraPlayers {
						if p != nil && p.ID != "" {
							winnerID = p.ID
							break
						}
					}
				}
				if winnerID != "" && updatedRoom.IsActive {
					res := GameResultPayload{WinnerID: winnerID, Message: message}
					b, _ := json.Marshal(res)
					for _, cID := range h.wsManager.GetClientIDsByPlayerID(winnerID) {
						_ = h.wsManager.SendToClient(cID, Message{Type: "GAME_FINISHED", Payload: b})
					}
					h.cleanupFinishedRoom(updatedRoom)
				}
			}
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

func (h *WebSocketHandler) cleanupFinishedRoom(room *domain.Room) {
	playerIDs := make([]string, 0, room.CountPlayers())
	if room.Player1 != nil && room.Player1.ID != "" {
		playerIDs = append(playerIDs, room.Player1.ID)
	}
	if room.Player2 != nil && room.Player2.ID != "" {
		playerIDs = append(playerIDs, room.Player2.ID)
	}
	for _, p := range room.ExtraPlayers {
		if p != nil && p.ID != "" {
			playerIDs = append(playerIDs, p.ID)
		}
	}

	for _, playerID := range playerIDs {
		clientIDs := h.wsManager.GetClientIDsByPlayerID(playerID)
		for _, clientID := range clientIDs {
			_ = h.leaveRoomUC.Execute(usecase.LeaveRoomInput{ClientID: clientID, PlayerID: playerID})
			h.wsManager.RemoveClientAssociation(clientID)
		}
		sessionID := h.getSessionIDByPlayerID(playerID)
		if sessionID != "" {
			h.cancelGracefulLeave(sessionID)
			h.sessionMu.Lock()
			delete(h.sessionToPlayer, sessionID)
			delete(h.playerToSession, playerID)
			h.sessionMu.Unlock()
		}
	}
	_ = h.roomRepo.Delete(room.ID)
}

func (h *WebSocketHandler) buildBROpponentSnapshots(room *domain.Room, playerID string) []BROpponentPayload {
	snapshots := make([]BROpponentPayload, 0, room.CountPlayers())
	appendSnapshot := func(player *domain.Player, gameState *domain.GameState) {
		if player == nil || player.ID == "" || player.ID == playerID {
			return
		}
		snapshot := BROpponentPayload{
			PlayerID:   player.ID,
			Score:      player.Score,
			Combo:      player.Combo,
			Effect:     player.ActiveEffect(),
			Selections: []int{},
		}
		if gameState != nil {
			snapshot.Target = gameState.Target
			snapshot.Images = append([]string(nil), gameState.Images...)
		}
		snapshots = append(snapshots, snapshot)
	}

	appendSnapshot(room.Player1, room.GameState1)
	appendSnapshot(room.Player2, room.GameState2)
	for i, player := range room.ExtraPlayers {
		var gameState *domain.GameState
		if i < len(room.ExtraGameStates) {
			gameState = room.ExtraGameStates[i]
		}
		appendSnapshot(player, gameState)
	}

	return snapshots
}

func (h *WebSocketHandler) heartbeatPump(clientID string) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	const pongTimeout = 45 * time.Second

	for range ticker.C {
		if h.wsManager.IsPongTimedOut(clientID, pongTimeout) {
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
	Capacity     int    `json:"capacity,omitempty"`
}

type LeaveRoomPayload struct {
	PlayerID string `json:"player_id"`
}

type RoomAssignedPayload struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
}

type GameStartPayload struct {
	Target               string              `json:"target"`
	Images               []string            `json:"images"`
	OpponentImages       []string            `json:"opponent_images"`
	WinningScore         int                 `json:"winning_score"`
	MyCurrentScore       int                 `json:"my_current_score,omitempty"`
	OpponentCurrentScore int                 `json:"opponent_current_score,omitempty"`
	PlayerEffect         string              `json:"player_effect,omitempty"`
	BROpponents          []BROpponentPayload `json:"br_opponents,omitempty"`
}

type VerifyPayload struct {
	RoomID          string `json:"room_id"`
	PlayerID        string `json:"player_id"`
	Target          string `json:"target"`
	SelectedIndices []int  `json:"selected_indices"`
}

type UpdatePatternPayload struct {
	Target       string   `json:"target"`
	Images       []string `json:"images"`
	CurrentScore int      `json:"current_score,omitempty"`
	CurrentCombo int      `json:"current_combo,omitempty"`
}

type OpponentUpdatePayload struct {
	Images      []string            `json:"images"`
	Score       int                 `json:"score"`
	Combo       int                 `json:"combo"`
	BROpponents []BROpponentPayload `json:"br_opponents,omitempty"`
}

type BROpponentPayload struct {
	PlayerID   string   `json:"player_id"`
	Target     string   `json:"target"`
	Images     []string `json:"images"`
	Score      int      `json:"score"`
	Combo      int      `json:"combo"`
	Effect     string   `json:"effect,omitempty"`
	Selections []int    `json:"selections"`
}

type SelectImagePayload struct {
	RoomID     string `json:"room_id"`
	PlayerID   string `json:"player_id"`
	ImageIndex int    `json:"image_index"`
}

type ObstructionPayload struct {
	Effect     string `json:"effect"`
	AttackerID string `json:"attacker_id"`
	TargetID   string `json:"target_id"`
}

type GameResultPayload struct {
	WinnerID string `json:"winner_id"`
	Message  string `json:"message"`
}
