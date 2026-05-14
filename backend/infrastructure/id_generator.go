package infrastructure

import (
	"math/rand"
	"recaptchgame-backend/domain"
)

// TimeBasedIDGenerator は時刻ベースのID採番を実装
type TimeBasedIDGenerator struct{}

// NewTimeBasedIDGenerator は新しい TimeBasedIDGenerator を生成
func NewTimeBasedIDGenerator() domain.IDGenerator {
	return &TimeBasedIDGenerator{}
}

// GenerateRoomID は6文字のランダム英数字ルームIDを生成
func (ig *TimeBasedIDGenerator) GenerateRoomID() string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, 6)
	for i := range result {
		result[i] = chars[rand.Intn(len(chars))]
	}
	return string(result)
}
