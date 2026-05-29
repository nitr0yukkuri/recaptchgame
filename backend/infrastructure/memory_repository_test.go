package infrastructure

import (
	"fmt"
	"testing"

	"recaptchgame-backend/domain"
)

// TestMemoryRoomRepository ルームリポジトリのテスト
func TestMemoryRoomRepository(t *testing.T) {
	repo := NewMemoryRoomRepository()

	// テスト1: ルームを保存して取得
	room := domain.NewRoom("room1", "player1", "player2", 5, 2)
	err := repo.Save(room)
	if err != nil {
		t.Fatalf("failed to save room: %v", err)
	}

	retrieved, err := repo.FindByID("room1")
	if err != nil {
		t.Fatalf("failed to find room: %v", err)
	}

	if retrieved.ID != "room1" {
		t.Errorf("expected room id room1, got %s", retrieved.ID)
	}

	// テスト2: 存在しないルームを取得
	_, err2 := repo.FindByID("nonexistent")
	if err2 == nil {
		t.Errorf("expected error when finding nonexistent room")
	}

	// テスト3: ルームを削除
	err = repo.Delete("room1")
	if err != nil {
		t.Fatalf("failed to delete room: %v", err)
	}

	_, err = repo.FindByID("room1")
	if err == nil {
		t.Errorf("expected error after deleting room")
	}

	// テスト4: プレイヤーIDからルームを検索
	room1 := domain.NewRoom("room1", "player1", "player2", 5, 2)
	repo.Save(room1)

	found, err7 := repo.FindByPlayerID("player1")
	if err7 != nil {
		t.Fatalf("failed to find room by player id: %v", err7)
	}

	if found.ID != "room1" {
		t.Errorf("expected room1, got %s", found.ID)
	}

	// テスト5: 待機ルームの設定と取得
	waitingRoom := domain.NewRoom("waiting", "player3", "", 5, 2)
	err3 := repo.SetWaitingRoom(2, waitingRoom)
	if err3 != nil {
		t.Fatalf("failed to set waiting room: %v", err3)
	}

	retrieved2, err4 := repo.GetWaitingRoom(2)
	if err4 != nil {
		t.Fatalf("failed to get waiting room: %v", err4)
	}

	if retrieved2.ID != "waiting" {
		t.Errorf("expected waiting room, got %s", retrieved2.ID)
	}

	waitingRoom4 := domain.NewRoom("waiting4", "player4", "", 5, 4)
	err3b := repo.SetWaitingRoom(4, waitingRoom4)
	if err3b != nil {
		t.Fatalf("failed to set waiting room for capacity 4: %v", err3b)
	}

	retrieved4, err4b := repo.GetWaitingRoom(4)
	if err4b != nil {
		t.Fatalf("failed to get waiting room for capacity 4: %v", err4b)
	}

	if retrieved4.ID != "waiting4" {
		t.Errorf("expected waiting4 room, got %s", retrieved4.ID)
	}

	// テスト6: 待機ルームをクリア
	err5 := repo.ClearWaitingRoom(2)
	if err5 != nil {
		t.Fatalf("failed to clear waiting room: %v", err5)
	}

	_, err6 := repo.GetWaitingRoom(2)
	if err6 == nil {
		t.Errorf("expected error after clearing waiting room")
	}

	if _, err := repo.GetWaitingRoom(4); err != nil {
		t.Errorf("expected capacity 4 waiting room to remain")
	}

	// テスト7: アクティブなルームをリスト
	room2 := domain.NewRoom("room2", "player4", "player5", 5, 2)
	repo.Save(room1)
	repo.Save(room2)

	room1.Start()

	active, err := repo.ListActive()
	if err != nil {
		t.Fatalf("failed to list active rooms: %v", err)
	}

	if len(active) != 1 {
		t.Errorf("expected 1 active room, got %d", len(active))
	}

	if active[0].ID != "room1" {
		t.Errorf("expected room1 to be active, got %s", active[0].ID)
	}
}

// TestMemoryClientRepository クライアントリポジトリのテスト
func TestMemoryClientRepository(t *testing.T) {
	repo := NewMemoryClientRepository()

	// テスト1: クライアントを割り当てて取得
	err := repo.AssignClient("client1", "player1")
	if err != nil {
		t.Fatalf("failed to assign client: %v", err)
	}

	playerID, err := repo.GetPlayerID("client1")
	if err != nil {
		t.Fatalf("failed to get player id: %v", err)
	}

	if playerID != "player1" {
		t.Errorf("expected player1, got %s", playerID)
	}

	// テスト2: 存在しないクライアントを取得
	_, err = repo.GetPlayerID("nonexistent")
	if err == nil {
		t.Errorf("expected error when getting nonexistent client")
	}

	// テスト3: クライアントを削除
	err = repo.RemoveClient("client1")
	if err != nil {
		t.Fatalf("failed to remove client: %v", err)
	}

	_, err = repo.GetPlayerID("client1")
	if err == nil {
		t.Errorf("expected error after removing client")
	}

	// テスト4: 複数クライアントの管理
	repo.AssignClient("client2", "player2")
	repo.AssignClient("client3", "player2")
	repo.AssignClient("client4", "player3")

	// player2に複数クライアントが割り当てられている
	p2id, _ := repo.GetPlayerID("client2")
	p3id, _ := repo.GetPlayerID("client3")
	if p2id != "player2" || p3id != "player2" {
		t.Errorf("expected both clients assigned to player2")
	}

	// 1つ削除
	repo.RemoveClient("client2")

	// client3はまだ取得可能
	p3id2, err := repo.GetPlayerID("client3")
	if err != nil || p3id2 != "player2" {
		t.Errorf("expected client3 still to be assigned to player2")
	}

	// client2は削除されている
	_, err = repo.GetPlayerID("client2")
	if err == nil {
		t.Errorf("expected client2 to be deleted")
	}
}

// TestRepositoryConcurrency リポジトリの並行処理テスト
func TestRepositoryConcurrency(t *testing.T) {
	roomRepo := NewMemoryRoomRepository()
	clientRepo := NewMemoryClientRepository()

	// 複数のゴルーチンから同時にアクセス
	done := make(chan bool, 10)

	for i := 1; i <= 10; i++ {
		go func(index int) {
			roomID := fmt.Sprintf("room%d", index)
			playerID := fmt.Sprintf("player%d", index)
			clientID := fmt.Sprintf("client%d", index)

			room := domain.NewRoom(roomID, playerID, "", 5, 2)
			roomRepo.Save(room)

			clientRepo.AssignClient(clientID, playerID)

			// 読み込み
			_, _ = roomRepo.FindByID(roomID)
			_, _ = clientRepo.GetPlayerID(clientID)

			done <- true
		}(i)
	}

	// 全てのゴルーチンが完了するのを待つ
	for i := 0; i < 10; i++ {
		<-done
	}

	// 最後に全てのルームが存在することを確認
	for i := 1; i <= 10; i++ {
		roomID := fmt.Sprintf("room%d", i)
		_, err := roomRepo.FindByID(roomID)
		if err != nil {
			t.Errorf("expected room %s to exist", roomID)
		}
	}
}

// TestRepositoryIsolation リポジトリインスタンスの独立性テスト
func TestRepositoryIsolation(t *testing.T) {
	repo1 := NewMemoryRoomRepository()
	repo2 := NewMemoryRoomRepository()

	room1 := domain.NewRoom("room1", "player1", "player2", 5, 2)
	repo1.Save(room1)

	// repo2は room1 を持っていない
	_, err := repo2.FindByID("room1")
	if err == nil {
		t.Errorf("expected repo2 not to have room1")
	}

	// repo1 には room1 がある
	_, err = repo1.FindByID("room1")
	if err != nil {
		t.Errorf("expected repo1 to have room1")
	}
}
