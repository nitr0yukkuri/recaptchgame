# reCAPTCHA Game

**〜 60秒以内に何回、人間か証明できる？ 〜**

日常でおなじみの **reCAPTCHA（画像選択認証）** を、
対戦型ゲームとして再構築した Web アプリケーションです。

CPU またはオンライン上のプレイヤーと対戦し、
**どちらがより速く「人間であること」を証明できるか** を競います。

---

## 🎮 ゲームモード

### 🤖 CPU対戦（Solo）

* AIボットと対戦する練習モードです。
* 相手の強さは一定で、落ち着いて操作を練習できます。

### 🌍 ランダムマッチ（Online）

* オンライン上のプレイヤーと即時マッチングします。
* 待機中のユーザー同士をサーバーが自動でマッチさせます。

### 🤝 フレンド対戦（Online）

* 「合言葉（ルームID）」を共有し、特定の友達と対戦できます。

---

## 🛠 機能・システム

* **リアルタイム通信**
  WebSocket を使用し、相手のスコアや選択状況を低遅延で同期します。

* **正誤判定ロジック**
  「車」「信号機」などの対象物をサーバーサイドで判定します。
  ※ CPUモードの一部ではクライアント判定も使用

* **勝利条件**
  先に **5問正解** したプレイヤーの勝利です。

* **Rival View**
  相手が現在どの画像を選択しているか、進捗をリアルタイムで可視化します。

---

## 💻 技術構成（Tech Stack）

### Frontend

* **Framework:** React（Vite）
* **Language:** TypeScript
* **Styling:** Tailwind CSS
* **Animation:** Framer Motion
* **State Management:** Zustand
* **Communication:** WebSocket（react-use-websocket）

### Backend

* **Language:** Go（1.21）
* **Framework:** Echo
* **WebSocket:** Gorilla WebSocket
* **Architecture:** In-Memory Room Management（マップによるオンメモリ管理）

### Infrastructure

* **Platform:** Render

  * Web Service：Backend（Go）
  * Static Site：Frontend（React / Vite）

---

## 🚀 ローカルでの実行方法

### Backend

```bash
cd backend
go mod tidy
go run main.go
# Server starts at :8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# App starts at http://localhost:5173
```

---

## 📂 ディレクトリ構成

```text
.
├── backend/            # Go API & WebSocket Server
│   ├── main.go         # エントリーポイント & ゲームロジック
│   └── go.mod
├── frontend/           # React Application
│   ├── src/
│   │   ├── App.tsx     # メインUIコンポーネント
│   │   └── store.ts    # Zustandによる状態管理
│   └── tailwind.config.js
└── render.yaml         # Render へのデプロイ設定
```
