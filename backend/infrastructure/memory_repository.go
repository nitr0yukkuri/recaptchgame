package infrastructure

import (
	"fmt"
	"sync"

	"recaptchgame-backend/domain"
)

// MemoryRoomRepository はメモリベースのルームリポジトリ
type MemoryRoomRepository struct {
	mu           sync.RWMutex
	rooms        map[string]*domain.Room
	waitingRooms map[int]*domain.Room
}

// NewMemoryRoomRepository は新しいMemoryRoomRepositoryを生成
func NewMemoryRoomRepository() *MemoryRoomRepository {
	return &MemoryRoomRepository{
		rooms:        make(map[string]*domain.Room),
		waitingRooms: make(map[int]*domain.Room),
	}
}

// FindByID はIDからルームを取得
func (r *MemoryRoomRepository) FindByID(roomID string) (*domain.Room, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	room, ok := r.rooms[roomID]
	if !ok {
		return nil, fmt.Errorf("room not found: %s", roomID)
	}
	return copyRoom(room), nil
}

// Save はルームを保存
func (r *MemoryRoomRepository) Save(room *domain.Room) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.rooms[room.ID] = room
	return nil
}

// Delete はルームを削除
func (r *MemoryRoomRepository) Delete(roomID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.rooms, roomID)
	return nil
}

// FindByPlayerID はプレイヤーIDからルームを検索
func (r *MemoryRoomRepository) FindByPlayerID(playerID string) (*domain.Room, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, room := range r.rooms {
		if (room.Player1 != nil && room.Player1.ID == playerID) ||
			(room.Player2 != nil && room.Player2.ID == playerID) {
			return copyRoom(room), nil
		}
		for _, p := range room.ExtraPlayers {
			if p != nil && p.ID == playerID {
				return copyRoom(room), nil
			}
		}
	}
	return nil, fmt.Errorf("room not found for player: %s", playerID)
}

// ListActive はアクティブなルームをリスト
func (r *MemoryRoomRepository) ListActive() ([]*domain.Room, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var active []*domain.Room
	for _, room := range r.rooms {
		if room.IsActive {
			active = append(active, copyRoom(room))
		}
	}
	return active, nil
}

// GetWaitingRoom はマッチング待機中のルームを取得
func (r *MemoryRoomRepository) GetWaitingRoom(capacity int) (*domain.Room, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	waitingRoom, ok := r.waitingRooms[capacity]
	if !ok || waitingRoom == nil {
		return nil, fmt.Errorf("no waiting room")
	}
	return copyRoom(waitingRoom), nil
}

// copyRoom makes a shallow copy of Room and its nested structs to avoid exposing
// internal pointers to callers (prevents data races when callers modify returned object).
func copyRoom(src *domain.Room) *domain.Room {
	if src == nil {
		return nil
	}
	dst := &domain.Room{
		ID:           src.ID,
		WinningScore: src.WinningScore,
		IsActive:     src.IsActive,
		Capacity:     src.Capacity,
	}
	if src.Player1 != nil {
		dst.Player1 = &domain.Player{ID: src.Player1.ID, Score: src.Player1.Score, Combo: src.Player1.Combo, CurrentEffect: src.Player1.CurrentEffect, EffectExpiresAt: src.Player1.EffectExpiresAt}
	}
	if src.Player2 != nil {
		dst.Player2 = &domain.Player{ID: src.Player2.ID, Score: src.Player2.Score, Combo: src.Player2.Combo, CurrentEffect: src.Player2.CurrentEffect, EffectExpiresAt: src.Player2.EffectExpiresAt}
	}
	if src.GameState1 != nil {
		dst.GameState1 = &domain.GameState{Target: src.GameState1.Target, Images: append([]string{}, src.GameState1.Images...)}
	}
	if src.GameState2 != nil {
		dst.GameState2 = &domain.GameState{Target: src.GameState2.Target, Images: append([]string{}, src.GameState2.Images...)}
	}
	if len(src.ExtraPlayers) > 0 {
		dst.ExtraPlayers = make([]*domain.Player, len(src.ExtraPlayers))
		for i, p := range src.ExtraPlayers {
			if p != nil {
				dst.ExtraPlayers[i] = &domain.Player{ID: p.ID, Score: p.Score, Combo: p.Combo, CurrentEffect: p.CurrentEffect, EffectExpiresAt: p.EffectExpiresAt}
			}
		}
	}
	if len(src.ExtraGameStates) > 0 {
		dst.ExtraGameStates = make([]*domain.GameState, len(src.ExtraGameStates))
		for i, gs := range src.ExtraGameStates {
			if gs != nil {
				dst.ExtraGameStates[i] = &domain.GameState{Target: gs.Target, Images: append([]string{}, gs.Images...)}
			}
		}
	}
	return dst
}

// SetWaitingRoom はマッチング待機ルームを設定
func (r *MemoryRoomRepository) SetWaitingRoom(capacity int, room *domain.Room) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if capacity <= 0 {
		capacity = room.Capacity
	}
	r.waitingRooms[capacity] = copyRoom(room)
	return nil
}

// ClearWaitingRoom はマッチング待機ルームをクリア
func (r *MemoryRoomRepository) ClearWaitingRoom(capacity int) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.waitingRooms, capacity)
	return nil
}

// MemoryClientRepository はメモリベースのクライアントリポジトリ
type MemoryClientRepository struct {
	mu              sync.RWMutex
	clientToPlayer  map[string]string   // clientID -> playerID
	playerToClients map[string][]string // playerID -> []clientID
	clientToRoom    map[string]string   // clientID -> roomID
}

// NewMemoryClientRepository は新しいMemoryClientRepositoryを生成
func NewMemoryClientRepository() *MemoryClientRepository {
	return &MemoryClientRepository{
		clientToPlayer:  make(map[string]string),
		playerToClients: make(map[string][]string),
		clientToRoom:    make(map[string]string),
	}
}

// AssignClient はクライアントをプレイヤーIDに割り当てる
func (r *MemoryClientRepository) AssignClient(clientID string, playerID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.clientToPlayer[clientID] = playerID

	if _, ok := r.playerToClients[playerID]; !ok {
		r.playerToClients[playerID] = []string{}
	}
	r.playerToClients[playerID] = append(r.playerToClients[playerID], clientID)

	return nil
}

// GetPlayerID はクライアントIDからプレイヤーIDを取得
func (r *MemoryClientRepository) GetPlayerID(clientID string) (string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	playerID, ok := r.clientToPlayer[clientID]
	if !ok {
		return "", fmt.Errorf("client not found: %s", clientID)
	}
	return playerID, nil
}

// RemoveClient はクライアントを削除
func (r *MemoryClientRepository) RemoveClient(clientID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	playerID, ok := r.clientToPlayer[clientID]
	if !ok {
		return nil // 既に削除されている
	}

	delete(r.clientToPlayer, clientID)

	// playerToClients から削除
	if clients, ok := r.playerToClients[playerID]; ok {
		for i, cID := range clients {
			if cID == clientID {
				r.playerToClients[playerID] = append(clients[:i], clients[i+1:]...)
				break
			}
		}
		if len(r.playerToClients[playerID]) == 0 {
			delete(r.playerToClients, playerID)
		}
	}

	delete(r.clientToRoom, clientID)
	return nil
}

// ListClientsByRoomID はルームIDからクライアントをリスト
func (r *MemoryClientRepository) ListClientsByRoomID(roomID string) ([]string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var clients []string
	for clientID, rid := range r.clientToRoom {
		if rid == roomID {
			clients = append(clients, clientID)
		}
	}
	return clients, nil
}
