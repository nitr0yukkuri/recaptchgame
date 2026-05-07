package domain

// IDGenerator はID採番のインターフェース
// 依存を外部化することで、テスト時にモック可能にする
type IDGenerator interface {
	GenerateRoomID() string
}
