package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/websocket"
	"recaptchgame-backend/domain"
	"recaptchgame-backend/handler"
	"recaptchgame-backend/infrastructure"
	"recaptchgame-backend/usecase"
)

func init() {
	rand.Seed(time.Now().UnixNano())
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	// Application層のインスタンス（DI）
	wsManager          *handler.WebSocketManager
	wsHandler          *handler.WebSocketHandler
	roomRepo           domain.RoomRepository
	clientRepo         domain.ClientRepository
	joinRoomUC         *usecase.JoinRoomUseCase
	verifyAnswerUC     *usecase.VerifyAnswerUseCase
	startGameUC        *usecase.StartGameUseCase
	leaveRoomUC        *usecase.LeaveRoomUseCase
	problemGeneratorUC *usecase.ProblemGeneratorUseCase
)

func init() {
	// インフラストラクチャの初期化
	roomRepo = infrastructure.NewMemoryRoomRepository()
	clientRepo = infrastructure.NewMemoryClientRepository()

	// ユースケース層の初期化
	problemGeneratorUC = usecase.NewProblemGeneratorUseCase(
		domain.Targets,
		domain.AllImages,
		domain.TargetSearchKeyMap,
	)
	joinRoomUC = usecase.NewJoinRoomUseCase(roomRepo, clientRepo)
	verifyAnswerUC = usecase.NewVerifyAnswerUseCase(roomRepo, problemGeneratorUC, domain.EffectTypes)
	startGameUC = usecase.NewStartGameUseCase(roomRepo, problemGeneratorUC)
	leaveRoomUC = usecase.NewLeaveRoomUseCase(roomRepo, clientRepo)

	// ハンドラー層の初期化
	wsManager = handler.NewWebSocketManager()
	wsHandler = handler.NewWebSocketHandler(
		wsManager,
		joinRoomUC,
		verifyAnswerUC,
		startGameUC,
		leaveRoomUC,
		roomRepo,
	)
}

func main() {
	port := getEnv("PORT", "8080")

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Backend Running"))
	})

	http.HandleFunc("/ws", serveWebSocket)

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}

func serveWebSocket(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	// クライアントIDを生成
	clientID := fmt.Sprintf("client_%d", time.Now().UnixNano())

	// ハンドラーに処理を委譲
	wsHandler.HandleConnection(clientID, ws)
}
