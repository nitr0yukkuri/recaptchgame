package domain

// RoomRepository はルームの永続化インターフェース
type RoomRepository interface {
	// FindByID はIDからルームを取得
	FindByID(roomID string) (*Room, error)

	// Save はルームを保存
	Save(room *Room) error

	// Delete はルームを削除
	Delete(roomID string) error

	// FindByPlayerID はプレイヤーIDからルームを検索
	FindByPlayerID(playerID string) (*Room, error)

	// ListActive はアクティブなルームをリスト
	ListActive() ([]*Room, error)

	// GetWaitingRoom はマッチング待機中のルームを取得
	GetWaitingRoom(capacity int) (*Room, error)

	// SetWaitingRoom はマッチング待機ルームを設定
	SetWaitingRoom(capacity int, room *Room) error

	// ClearWaitingRoom はマッチング待機ルームをクリア
	ClearWaitingRoom(capacity int) error
}

// ClientRepository はクライアント接続の管理インターフェース
type ClientRepository interface {
	// AssignClient はクライアントをプレイヤーIDに割り当てる
	AssignClient(clientID string, playerID string) error

	// GetPlayerID はクライアントIDからプレイヤーIDを取得
	GetPlayerID(clientID string) (string, error)

	// RemoveClient はクライアントを削除
	RemoveClient(clientID string) error

	// ListClientsByRoomID はルームIDからクライアントをリスト
	ListClientsByRoomID(roomID string) ([]string, error)
}
