package main

import "encoding/json"

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type PlayerState struct {
	Images []string
	Target string
	Score  int
	Combo  int
}

type JoinRoomPayload struct {
	RoomID       string `json:"room_id"`
	PlayerID     string `json:"player_id"`
	WinningScore int    `json:"winning_score"`
}

type RoomAssignedPayload struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
}

type VerifyPayload struct {
	RoomID          string `json:"room_id"`
	PlayerID        string `json:"player_id"`
	SelectedIndices []int  `json:"selected_indices"`
}

type GameStartPayload struct {
	Target         string   `json:"target"`
	Images         []string `json:"images"`
	OpponentImages []string `json:"opponent_images"`
	WinningScore   int      `json:"winning_score"`
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

type ObstructionPayload struct {
	Effect     string `json:"effect"`
	AttackerID string `json:"attacker_id"`
}

type GameResultPayload struct {
	WinnerID string `json:"winner_id"`
	Message  string `json:"message"`
}

type SelectImagePayload struct {
	RoomID     string `json:"room_id"`
	PlayerID   string `json:"player_id"`
	ImageIndex int    `json:"image_index"`
}
