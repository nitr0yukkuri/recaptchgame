# reCAPTCHA Game

## 🎮 概要 (Overview)
おなじみの「画像認証（reCAPTCHA）」をモチーフにした、新感覚のリアルタイム対戦ゲームです。
出題されるお題（例：「車」「信号機」「階段」など）に当てはまる画像を素早く正確に選択し、相手より先に目標スコアに到達することを目指します。

一人で遊べる「CPU戦」、1対1で白熱する「オンライン対戦」に加え、最大4人で生き残りをかけて戦う「バトルロワイヤルモード」に新たに対応しました。

## ✨ 特徴・こだわりポイント (Features)

* **最大4人のバトルロワイヤルモード (BATTLE ROYALE)**
    新たに実装されたバトルロワイヤルモードでは、自分以外の3人のプレイヤーの進行状況がリアルタイムで画面に同期されます。専用のクロスレイアウトUIを採用し、多人数ならではの緊迫感ある対戦を実現しています。
* **リアルタイムな対戦状況の可視化 (RIVAL VIEW)**
    WebSocketによる低遅延な同期通信により、相手が今どの画像を選択しているかが「RIVAL VIEW」としてリアルタイムに表示されます。焦燥感を煽るスリリングなUIデザインです。
* **コンボ＆お邪魔（妨害）エフェクトシステム**
    連続で正解してコンボを繋ぐと、相手の画面に対して様々な妨害エフェクトを発動できます。
    * `SHAKE` (画面揺れ) / `SPIN` (回転) / `SKEW` (歪み)
    * `BLUR` (ぼかし) / `INVERT` (色反転) / `GRAYSCALE` (白黒)
    * `ONION_RAIN` (画面に玉ねぎが降ってくる謎演出) 🧅
* **心地よいUI/UXとサウンド演出**
    `Framer Motion`を活用したスムーズなアニメーションと、`Tone.js`によるブラウザ上でのリッチなサウンド再生を組み合わせ、プレイしていて気持ちの良い操作感を実現しました。
* **モダンで軽量なフロントエンド**
    状態管理にはReduxではなく軽量な`Zustand`を採用し、シンプルかつ拡張性の高いコードベースを維持しています。スタイリングは`Tailwind CSS`でスピーディに構築しています。

## 🛠 技術構成 (Tech Stack)

### Frontend
* **Core**: React 18, TypeScript, Vite
* **State Management**: Zustand
* **Styling**: Tailwind CSS, clsx, tailwind-merge
* **Animation**: Framer Motion
* **Communication**: react-use-websocket
* **Audio**: Tone.js

### Backend
* **Core**: Go (Golang)
* **Communication**: WebSocket (`net/http`)
* **Architecture**: 標準モジュールベースの軽量かつシンプルなサーバー構成

## 🚀 遊び方 (How to Play)

1.  ゲームモード（CPU戦、オンライン戦、または バトルロワイヤル）を選択します。
2.  画面上部に表示される「お題」（例：以下の画像をすべて選択：車）を確認します。
3.  9枚のパネルの中から、お題に合致する画像をすべてクリックして選択します。
4.  「確認」ボタンを押して判定を行います。正解するとスコアが加算されます！
5.  相手より先に目標スコア（Winning Score）に到達したプレイヤーの勝利です。
6.  *Hint: 早く正確に答えてコンボを繋げば、相手の画面を妨害できます！*

## 📦 ローカルでの環境構築 (Setup)
### Backend (Go)

```bash
cd backend
go mod download
go run main.go
# デフォルトでポート8080で起動します
```

### Frontend (React/Vite)

```bash
cd frontend
npm install
npm run dev
# localhost:5173 などでプレビューが開きます
```
