package infrastructure

import (
	"fmt"
	"time"

	"recaptchgame-backend/domain"
)

// TimeBasedIDGenerator は時刻ベースのID採番を実装
type TimeBasedIDGenerator struct{}

// NewTimeBasedIDGenerator は新しい TimeBasedIDGenerator を生成
func NewTimeBasedIDGenerator() domain.IDGenerator {
	return &TimeBasedIDGenerator{}
}

// GenerateRoomID はルームIDを生成
func (ig *TimeBasedIDGenerator) GenerateRoomID() string {
	return "ROOM_" + fmt.Sprintf("%d", time.Now().UnixNano())
}
