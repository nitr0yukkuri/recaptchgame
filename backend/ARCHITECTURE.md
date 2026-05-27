# アーキテクチャ分離案（概要）

目的: 単一プロセス・単一ポートに起因するサービス停止や運用リスクを低減し、マッチングの信頼性を高める。

コンポーネント:

1. WebSocket Gateway
   - 役割: クライアントの接続管理、heartbeat（PING/PONG）、個々の WebSocket メッセージの受け渡し。
   - 備考: 接続そのものは Gateway が持ち、ゲーム開始要求は Matchmaker に転送する。

2. Matchmaker Service
   - 役割: ルーム作成/割当ロジック、ランダムマッチング、ルームの状態遷移（待機→準備完了）を担当。
   - 実装: 軽量 HTTP/GRPC サービス。ステートは Redis などの共有 store に格納。

3. Game Worker / Engine
   - 役割: 実際のゲーム開始処理（問題生成、初期状態の構築）、ゲーム進行の一部処理（検証はここで行ってもよい）。
   - 備考: 負荷に応じて複数化できる。

4. State Store (Redis)
   - 役割: ルーム状態、セッションマッピング、短期キャッシュ。Pub/Sub を使って Gateway に通知を流す。

5. Message Bus
   - 役割: Gateway ↔ Matchmaker ↔ GameWorker 間の非同期通知。Redis Pub/Sub or NATS を推奨。

通信フロー (簡略):
- クライアント が Gateway に `JOIN_ROOM` を送る。
- Gateway は `JOIN_ROOM` を Matchmaker（HTTP/gRPC）に投げる、または Pub/Sub に publish する。
- Matchmaker はルームを割り当て、必要があれば GameWorker に `StartGame` をリクエスト。
- GameWorker は問題を生成して State Store に保存し、Pub/Sub 経由で Gateway に `GAME_START` を通知。
- Gateway はそのルームの接続に `GAME_START` を送信する。

利点:
- 単一プロセスの bind エラーや再起動失敗による全面停止リスクを分離可能。
- Gateway を冗長化（ロードバランス）すれば接続維持が容易。
- マッチングロジックを独立サービスにすることでスケーリングとテストが容易。

導入ステップ（段階的）:
1. 現行コードに Graceful shutdown とヘルスチェックを追加（今回実施）。
2. Matchmaker 部分（現在の `JoinRoomUseCase` の一部）を切り出し、小さな HTTP API として別プロセスで動かす PoC を実装。
3. Gateway を複数インスタンス化し、Redis Pub/Sub で通知する構成に移行。
4. Kubernetes などで運用する場合は readiness/liveness probes を追加。

運用上の注意:
- デバッグのために各コンポーネントのリクエスト/レスポンスログを整備すること。
- 破壊的リリースは段階的に行い、切り戻し手順を明確にすること。

