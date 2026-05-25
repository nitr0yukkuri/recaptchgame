import { useEffect, useRef, useState } from 'react';
import { useGameStore, ObstructionType } from '../store';
import { sleep } from '../utils/game';
import { useGameController } from './useGameController';

interface UseOnlineGameOptions {
    sendMessage: (msg: string) => void;
    lastMessage: MessageEvent<any> | null;
    setGameMode: (mode: 'CPU' | 'ONLINE' | null) => void;
    setMyScore: (fn: (prev: number) => number) => void;
    setWinningScore: (score: number) => void;
    playSuccess: () => void;
    playError: () => void;
    playWin: () => void;
    playLose: () => void;
    playStart: () => void;
}

/**
 * オンライン対戦のWebSocket通信ロジックを管理するフック。
 * - WebSocketメッセージハンドラ（switch 全体）
 * - カウントダウン演出
 * - handleVerifyOnline
 */
export function useOnlineGame({
    sendMessage,
    lastMessage,
    setGameMode,
    setMyScore,
    setWinningScore,
    playSuccess,
    playError,
    playWin,
    playLose,
    playStart,
}: UseOnlineGameOptions) {
    const [isVerifying, setIsVerifying] = useState(false);
    const [startPopup, setStartPopup] = useState(false);
    const [startMessage, setStartMessage] = useState('Start!');
    const [isCreator, setIsCreator] = useState(false);

    const controller = useGameController();

    const isMatchingRef = useRef(false);
    const prevMessageRef = useRef<MessageEvent<any> | null>(null);

    // ── WebSocket メッセージハンドラ ─────────────────────────
    useEffect(() => {
        if (!lastMessage || lastMessage === prevMessageRef.current) return;
        prevMessageRef.current = lastMessage;

        try {
            const msg = JSON.parse(lastMessage.data);
            const store = useGameStore.getState();

            switch (msg.type) {
                case 'PING':
                    sendMessage(JSON.stringify({ type: 'PONG', payload: {} }));
                    break;

                case 'ROOM_ASSIGNED':
                    store.setRoomInfo(msg.payload.room_id, store.playerId);
                    setGameMode('ONLINE');
                    if (store.gameState !== 'PLAYING') {
                        store.setGameState('WAITING');
                    }
                    break;

                case 'STATUS_UPDATE':
                    store.setGameState('WAITING');
                    break;

                case 'GAME_START':
                    if (isMatchingRef.current) return;
                    isMatchingRef.current = true;
                    setGameMode('ONLINE');
                    store.startGame(msg.payload.target, msg.payload.images);
                    if (msg.payload.opponent_images) {
                        store.updateCpuPattern('', msg.payload.opponent_images);
                    }
                    if (msg.payload.winning_score) {
                        setWinningScore(msg.payload.winning_score);
                    }
                    setMyScore(() => msg.payload.my_current_score ?? 0);
                    setIsVerifying(false);
                    store.setPlayerCombo(0);
                    store.setOpponentCombo(0);

                    (async () => {
                        setStartPopup(true);
                        setStartMessage('マッチングしました！');
                        playStart();
                        await sleep(1500);
                        if (!isMatchingRef.current) { setStartPopup(false); return; }
                        setStartMessage('3'); await sleep(1000);
                        if (!isMatchingRef.current) { setStartPopup(false); return; }
                        setStartMessage('2'); await sleep(1000);
                        if (!isMatchingRef.current) { setStartPopup(false); return; }
                        setStartMessage('1'); await sleep(1000);
                        if (!isMatchingRef.current) { setStartPopup(false); return; }
                        setStartMessage('START!'); await sleep(500);
                        if (!isMatchingRef.current) { setStartPopup(false); return; }
                        // schedule via controller (created once per hook)
                        controller.scheduleStartPopupHide(store.playerId, () => setStartPopup(false), 500);
                    })();
                    break;

                case 'UPDATE_PATTERN':
                    setIsVerifying(false);
                    playSuccess();
                    store.updatePlayerPattern(msg.payload.target, msg.payload.images);
                    store.setFeedback('CORRECT');
                    // サーバーが送る現在のスコア/コンボがあればそれを優先、なければ従来のローカル増分を行う
                    if (msg.payload.current_combo !== undefined) {
                        store.setPlayerCombo(msg.payload.current_combo);
                    } else {
                        store.setPlayerCombo(useGameStore.getState().playerCombo + 1);
                    }

                    if (msg.payload.current_score !== undefined) {
                        setMyScore(() => msg.payload.current_score);
                    } else {
                        setMyScore(prev => prev + 1);
                    }

                    setTimeout(() => store.setFeedback(null), 1000);
                    break;

                case 'OPPONENT_UPDATE':
                    store.updateCpuPattern('', msg.payload.images);
                    store.updateOpponentScore(msg.payload.score);
                    if (msg.payload.combo !== undefined) {
                        store.setOpponentCombo(msg.payload.combo);
                    }
                    store.resetOpponentSelections();
                    break;

                case 'OBSTRUCTION':
                    // 全員に妨害を適用する（攻撃者含む）
                    store.setPlayerEffect(msg.payload.effect as ObstructionType);
                    // 攻撃者以外のプレイヤーはコンボをリセット
                    if (msg.payload.attacker_id !== store.playerId) {
                        store.setPlayerCombo(0);
                    }
                    // effect の解除は useObstructionEffect に一元管理
                    break;

                case 'OPPONENT_SELECT':
                    if (msg.payload.player_id !== store.playerId) {
                        store.toggleOpponentSelection(msg.payload.image_index);
                    }
                    break;

                case 'GAME_FINISHED':
                    setIsVerifying(false);
                    if (msg.payload.winner_id === store.playerId) {
                        playWin();
                    } else {
                        playLose();
                    }
                    store.endGame(msg.payload.winner_id, msg.payload.message === 'Opponent Disconnected');
                    break;

                case 'VERIFY_FAILED':
                    setIsVerifying(false);
                    // stale closure 回避: getState() で最新 feedback を取得
                    if (useGameStore.getState().feedback !== 'WRONG') {
                        playError();
                        store.setFeedback('WRONG');
                        store.setPlayerCombo(0);
                        setTimeout(() => store.setFeedback(null), 1000);
                        store.resetMySelections();
                    }
                    break;
            }
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    }, [lastMessage]);

    // ── 回答送信（オンライン用）──────────────────────────────
    const handleVerifyOnline = () => {
        const store = useGameStore.getState();
        // Guard: do not send VERIFY when nothing is selected
        if (!store.mySelections || store.mySelections.length === 0) {
            console.warn('Attempted to VERIFY with no selections. Aborting.');
            setIsVerifying(false);
            return;
        }
        setIsVerifying(true);
        sendMessage(JSON.stringify({
            type: 'VERIFY',
            payload: { room_id: store.roomId, player_id: store.playerId, selected_indices: store.mySelections },
        }));
        // タイムアウトフォールバック（コントローラで一元管理）
        controller.scheduleVerifyFallback(store.playerId, () => setIsVerifying(prev => prev ? false : prev), 5000);
    };

    const stopMatching = () => {
        isMatchingRef.current = false;
        setStartPopup(false);
    };

    return {
        isVerifying,
        setIsVerifying,
        startPopup,
        startMessage,
        isCreator,
        setIsCreator,
        handleVerifyOnline,
        stopMatching,
    };
}
