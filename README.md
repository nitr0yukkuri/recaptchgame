# reCAPTCHA Game

**〜 60秒以内に何回人間か証明できる？ 〜**
日常の「reCAPTCHA（画像選択認証）」を対戦ゲーム化したWebアプリケーション。
CPUまたはオンラインの相手と競い合い、どちらが早く「人間であること」を証明できるか勝負します。

---

## 🎮 ゲームモード

### 1. 🤖 CPU対戦 (Solo)
- AIボットと対戦する練習モード。
- 相手の強さは一定ですが、自分のペースで練習できます。

### 2. 🌍 ランダムマッチ (Online)
- オンライン上の誰かと即座にマッチングして対戦します。
- サーバーが待機中のプレイヤーを自動的に引き合わせます。

### 3. 🤝 フレンド対戦 (Online)
- 「合言葉（ルームID）」を共有して、特定の友達と対戦できます。

---

## 🛠 機能・システム

- **リアルタイム通信:** WebSocketを使用し、相手のスコアや選択状況を低遅延で同期。
- **正誤判定ロジック:** 「車」「信号機」などの対象物をサーバーサイド（一部CPUモードはクライアント）で判定。
- **勝利条件:** 先に5問正解したプレイヤーの勝利。
- **Rival View:** 相手が現在どの画像を選んでいるか、進捗がリアルタイムで可視化されます。

---

## 💻 技術構成 (Tech Stack)

### Frontend
- **Framework:** React (Vite)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Animation:** Framer Motion
- **State Management:** Zustand
- **Communication:** WebSocket (react-use-websocket)

### Backend
- **Language:** Go (1.21)
- **Framework:** Echo
- **WebSocket:** Gorilla WebSocket
- **Architecture:** In-Memory Room Management (マップによるオンメモリ管理)

### Infrastructure
- **Platform:** Render
    - **Web Service:** Backend (Go)
    - **Static Site:** Frontend (React/Vite)

---

## 🚀 ローカルでの実行方法

### Backend
```bash
cd backend
go mod tidy
go run main.go
# Server starts at :8080
