package infrastructure

import (
	"fmt"
	"sync"

	"recaptchgame-backend/domain"
)

// MemoryRoomRepository はメモリベースのルームリポジトリ
type MemoryRoomRepository struct {
	mu          sync.RWMutex
	rooms       map[string]*domain.Room
	waitingRoom *domain.Room
}

// NewMemoryRoomRepository は新しいMemoryRoomRepositoryを生成
func NewMemoryRoomRepository() *MemoryRoomRepository {
	return &MemoryRoomRepository{
		rooms: make(map[string]*domain.Room),
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
	return room, nil
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
			return room, nil
		}
		for _, p := range room.ExtraPlayers {
			if p != nil && p.ID == playerID {
				return room, nil
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
			active = append(active, room)
		}
	}
	return active, nil
}

// GetWaitingRoom はマッチング待機中のルームを取得
func (r *MemoryRoomRepository) GetWaitingRoom() (*domain.Room, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.waitingRoom == nil {
		return nil, fmt.Errorf("no waiting room")
	}
	return r.waitingRoom, nil
}

// SetWaitingRoom はマッチング待機ルームを設定
func (r *MemoryRoomRepository) SetWaitingRoom(room *domain.Room) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.waitingRoom = room
	return nil
}

// ClearWaitingRoom はマッチング待機ルームをクリア
func (r *MemoryRoomRepository) ClearWaitingRoom() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.waitingRoom = nil
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
