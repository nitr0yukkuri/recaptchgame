package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"syscall"
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
	// IDGenerator の初期化（DI）
	idGenerator := infrastructure.NewTimeBasedIDGenerator()

	// ドメインサービスの初期化
	problemFactory := domain.NewProblemFactory()

	// ユースケース層の初期化（新フォーマット）
	roomGuard := usecase.NewRoomExecutionGuard()
	problemGeneratorUC = usecase.NewProblemGeneratorUseCase(problemFactory, domain.GetAllTargets())
	joinRoomUC = usecase.NewJoinRoomUseCase(roomRepo, clientRepo, idGenerator, roomGuard)
	verifyAnswerUC = usecase.NewVerifyAnswerUseCase(roomRepo, problemGeneratorUC, domain.GetAllEffects(), roomGuard)
	startGameUC = usecase.NewStartGameUseCase(roomRepo, problemGeneratorUC, roomGuard)
	leaveRoomUC = usecase.NewLeaveRoomUseCase(roomRepo, clientRepo, roomGuard)

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

	srv := &http.Server{Addr: ":" + port}

	go func() {
		log.Printf("Server starting on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	// シグナル待ち（Graceful shutdown）
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	// まず WebSocket 接続を全て閉じる
	if wsManager != nil {
		wsManager.CloseAll()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Server exiting")
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
