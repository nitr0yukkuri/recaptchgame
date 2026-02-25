package main

import (
	"net/http"
	"sync"
	"github.com/gorilla/websocket"
)

var (
	roomStates = make(map[string]map[string]*PlayerState)
	roomWinningScores = make(map[string]int)

	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	clients = make(map[*websocket.Conn]string)
	rooms = make(map[string]map[*websocket.Conn]bool)

	mu sync.Mutex

	waitingRoomID string
	matchMu       sync.Mutex
)

var allImages = []string{
	"/images/car1.jpg", "/images/car2.jpg", "/images/car3.jpg", "/images/car4.jpg", "/images/car5.jpg",
	"/images/shingouki1.jpg", "/images/shingouki2.jpg", "/images/shingouki3.jpg", "/images/shingouki4.jpg",
	"/images/kaidan0.jpg", "/images/kaidan1.jpg", "/images/kaidan2.jpg",
	"/images/shoukasen0.jpg", "/images/shoukasen1.jpg", "/images/shoukasen2.jpg",
	"/images/tamanegi5.png",
}

var targets = []string{"車", "信号機", "階段", "消火栓"}
var effects = []string{"SHAKE", "SPIN", "BLUR", "INVERT", "ONION_RAIN"}
