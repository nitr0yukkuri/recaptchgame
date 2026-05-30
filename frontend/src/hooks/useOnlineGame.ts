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
    onObstructionFired?: (effect: ObstructionType, attackerId?: string) => void;
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
    onObstructionFired,
}: UseOnlineGameOptions) {
    const [isVerifying, setIsVerifying] = useState(false);
    const [startPopup, setStartPopup] = useState(false);
    const [startMessage, setStartMessage] = useState('Start!');
    const [isCreator, setIsCreator] = useState(false);

    const controller = useGameController();

    const isMountedRef = useRef(true);
    const isMatchingRef = useRef(false);
    const prevMessageRef = useRef<MessageEvent<any> | null>(null);
    const brObstructionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            isMatchingRef.current = false;
            Object.values(brObstructionTimersRef.current).forEach(t => clearTimeout(t));
            brObstructionTimersRef.current = {};
        };
    }, []);

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
                    if (store.gameState !== 'PLAYING' && store.gameState !== 'RESULT') {
                        store.setGameState('WAITING');
                    }
                    break;

                case 'STATUS_UPDATE':
                    if (store.gameState === 'PLAYING') {
                        if (msg.payload?.message === 'Opponent Disconnected' && msg.payload?.player_id) {
                            store.setBROpponents(store.brOpponents.filter(opp => opp.id !== msg.payload.player_id));
                        }
                        break;
                    }
                    if (store.gameState !== 'RESULT') {
                        store.setGameState('WAITING');
                    }
                    break;

                case 'JOIN_FAILED':
                    setIsVerifying(false);
                    isMatchingRef.current = false;
                    setStartPopup(false);
                    setGameMode(null);
                    store.setRoomInfo('', store.playerId);
                    store.setGameState('LOGIN');
                    alert('部屋に入れませんでした');
                    break;

                case 'GAME_START':
                    const startPayload = msg.payload as any;
                    const existingBROpponents = store.brOpponents;
                    // If we're already actively matching/playing, avoid double-handling.
                    // However, ignore a stale `isMatchingRef` if we're not in PLAYING state —
                    // this allows reconnect scenarios where GAME_START may arrive again.
                    if (isMatchingRef.current && useGameStore.getState().gameState === 'PLAYING' && !startPayload.br_opponents) return;
                    isMatchingRef.current = true;
                    setGameMode('ONLINE');

                    // Immediately set up the game state so the GameScreen can render in the background
                    store.startGame(startPayload.target, startPayload.images);
                    // Apply opponent images (if any) and scoring info immediately so UI reflects opponent info
                    if (startPayload.opponent_images) {
                        store.updateCpuPattern('', startPayload.opponent_images);
                    }
                    if (startPayload.player_effect) {
                        store.setPlayerEffect(startPayload.player_effect as ObstructionType);
                        controller.scheduleNamed(`playerEffect:${store.playerId}`, () => {
                            useGameStore.getState().setPlayerEffect(null);
                        }, 3000);
                    }
                    if (Array.isArray(startPayload.br_opponents)) {
                        store.setBROpponents(startPayload.br_opponents.map((opp: any) => {
                            const existingOpp = existingBROpponents.find(existing => existing.id === opp.player_id);
                            return {
                                id: opp.player_id,
                                score: opp.score ?? 0,
                                combo: opp.combo ?? 0,
                                effect: opp.effect ?? existingOpp?.effect ?? null,
                                selections: existingOpp ? existingOpp.selections : [],
                                images: Array.isArray(opp.images) ? opp.images : [],
                                target: opp.target ?? '',
                            };
                        }));
                    }
                    if (startPayload.winning_score) {
                        setWinningScore(startPayload.winning_score);
                    }
                    setMyScore(() => startPayload.my_current_score ?? 0);
                    setIsVerifying(false);
                    store.setPlayerCombo(startPayload.my_current_combo ?? 0);
                    store.setOpponentCombo(0);

                    (async () => {
                        // Clear any previous BR obstruction timers carried over
                        // from a prior match to avoid cross-match leakage.
                        Object.values(brObstructionTimersRef.current).forEach(t => clearTimeout(t));
                        brObstructionTimersRef.current = {};

                        if (!isMountedRef.current) return;
                        setStartPopup(true);
                        setStartMessage('マッチングしました！');
                        playStart();
                        await sleep(1500);
                        if (!isMatchingRef.current || !isMountedRef.current) { setStartPopup(false); return; }
                        setStartMessage('3'); await sleep(1000);
                        if (!isMatchingRef.current || !isMountedRef.current) { setStartPopup(false); return; }
                        setStartMessage('2'); await sleep(1000);
                        if (!isMatchingRef.current || !isMountedRef.current) { setStartPopup(false); return; }
                        setStartMessage('1'); await sleep(1000);
                        if (!isMatchingRef.current || !isMountedRef.current) { setStartPopup(false); return; }
                        setStartMessage('START!'); await sleep(500);
                        if (!isMatchingRef.current || !isMountedRef.current) { setStartPopup(false); return; }

                        // schedule via controller (created once per hook)
                        if (!isMountedRef.current) return;
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
                    if (Array.isArray(msg.payload.br_opponents)) {
                        store.setBROpponents(msg.payload.br_opponents.map((opp: any) => {
                            const existingOpp = store.brOpponents.find(existing => existing.id === opp.player_id);
                            return {
                                id: opp.player_id,
                                score: opp.score ?? 0,
                                combo: opp.combo ?? 0,
                                effect: opp.effect ?? existingOpp?.effect ?? null,
                                selections: existingOpp ? existingOpp.selections : [],
                                images: Array.isArray(opp.images) ? opp.images : [],
                                target: opp.target ?? '',
                            };
                        }));
                    }
                    store.resetOpponentSelections();
                    break;

                case 'OBSTRUCTION':
                    const effect = msg.payload.effect as ObstructionType;
                    const targetId = msg.payload.target_id as string | undefined;
                    const attackerId = msg.payload.attacker_id as string | undefined;

                    // UI-only guard: if this client is the attacker, ignore the broadcasted OBSTRUCTION.
                    // Server sends OBSTRUCTION to whole room plus OBSTRUCTION_FIRED to attacker; to avoid
                    // duplicate/incorrect UI application on attacker side, ignore OBSTRUCTION when attacker.
                    if (attackerId && attackerId === store.playerId) {
                        break;
                    }

                    if (targetId && targetId === store.playerId) {
                        store.setPlayerEffect(effect);
                    } else if (targetId && store.brOpponents.some(opp => opp.id === targetId)) {
                        const timers = brObstructionTimersRef.current;
                        if (timers[targetId]) {
                            clearTimeout(timers[targetId]);
                            delete timers[targetId];
                        }
                        store.setBROpponentEffect(targetId, effect);
                        timers[targetId] = setTimeout(() => {
                            useGameStore.getState().setBROpponentEffect(targetId, null);
                            delete timers[targetId];
                        }, 3000);
                    } else {
                        store.setOpponentEffect(effect);
                    }
                    // effect の解除は useObstructionEffect に一元管理
                    break;
                case 'OBSTRUCTION_FIRED':
                    // サーバから攻撃者へ発動確認が来る（UI表示用）
                    try {
                        const eff = msg.payload.effect as string;
                        const aid = msg.payload.attacker_id as string;
                        if (onObstructionFired) onObstructionFired(eff as ObstructionType, aid);
                        // OBSTRUCTION_FIRED は攻撃者への「発動通知」のみ。
                        // 攻撃者自身には GRAYSCALE 等のエフェクトを適用しない。
                        // バナー表示は onObstructionFired (showBRAttack) で行われる。
                    } catch (e) {
                        console.warn('Invalid OBSTRUCTION_FIRED payload', e);
                    }
                    break;
                case 'OPPONENT_SELECT':
                    if (msg.payload.player_id !== store.playerId) {
                        if (store.brOpponents.some(opp => opp.id === msg.payload.player_id)) {
                            store.toggleBROpponentSelection(msg.payload.player_id, msg.payload.image_index);
                        }
                        store.toggleOpponentSelection(msg.payload.image_index);
                    }
                    break;

                case 'GAME_FINISHED':
                    setIsVerifying(false);
                    // Clear any BR timers to avoid effects persisting into next match
                    Object.values(brObstructionTimersRef.current).forEach(t => clearTimeout(t));
                    brObstructionTimersRef.current = {};

                    isMatchingRef.current = false; // allow next GAME_START to be processed
                    setStartPopup(false);           // カウントダウン演出中でも即座に閉じる
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
                        const feedbackKey = `verifyError:${store.playerId}`;
                        controller.clearNamed(feedbackKey);
                        playError();
                        store.setFeedback('WRONG');
                        store.setPlayerCombo(0);
                        controller.scheduleNamed(feedbackKey, () => store.setFeedback(null), 1000);
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
            payload: { room_id: store.roomId, player_id: store.playerId, target: store.target, selected_indices: store.mySelections },
        }));
        // タイムアウトフォールバック（コントローラで一元管理）
        controller.scheduleVerifyFallback(store.playerId, () => setIsVerifying(prev => prev ? false : prev), 1500);
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
