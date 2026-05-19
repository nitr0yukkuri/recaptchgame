import { useState, useEffect } from 'react';
import { useGameStore, ObstructionType, BROpponent } from '../store';
import { generateCpuProblem, getCorrectIndices, getRandomObstruction } from '../utils/game';
import { useGameController } from './useGameController';

interface UseCpuGameOptions {
    gameMode: 'CPU' | 'ONLINE' | null;
    setMyScore: (fn: (prev: number) => number) => void;
    setWinningScore: (score: number) => void;
    fireBRObstruction: (effect: ObstructionType, attackerId?: string | null) => void;
    playSuccess: () => void;
    playError: () => void;
    playLose: () => void;
    playStart: () => void;
}

/**
 * CPU対戦ロジックを管理するフック。
 * - CPUゲームループ (setInterval) 1vs1 & BRモード両対応
 * - 勝敗判定
 * - handleVerifyCpu / handleReload
 * - confirmDifficulty (ゲーム初期化)
 */
export function useCpuGame({
    gameMode,
    setMyScore,
    setWinningScore,
    fireBRObstruction,
    playSuccess,
    playError,
    playLose,
    playStart,
}: UseCpuGameOptions) {
    const [settingScore, setSettingScore] = useState(5);
    const [cpuPlayerCount, setCpuPlayerCount] = useState<1 | 3 | 4>(1);
    const [isReloading, setIsReloading] = useState(false);

    const { gameState, opponentScore } = useGameStore();

    const controller = useGameController();

    const shouldSkipWithObstruction = () => Math.random() < 0.95;

    // ── CPUゲームループ ──────────────────────────────────────
    useEffect(() => {
        if (gameMode !== 'CPU' || gameState !== 'PLAYING') return;

        const difficulty = useGameStore.getState().cpuDifficulty;
        let intervalTime = 800;
        let actionProb = 0.35;
        let submitProb = 0.35;
        if (difficulty === 1) { intervalTime = 1400; actionProb = 0.6; submitProb = 0.2; }
        else if (difficulty === 3) { intervalTime = 900; actionProb = 0.25; submitProb = 0.5; }

        const interval = setInterval(() => {
            const store = useGameStore.getState();

            if (cpuPlayerCount === 1) {
                // 1vs1 CPU シミュレーション
                if (store.opponentEffect && shouldSkipWithObstruction()) return;

                const correctIndices = getCorrectIndices(store.cpuImages, store.cpuTarget);
                const remaining = correctIndices.filter(i => !store.opponentSelections.includes(i));

                if (remaining.length > 0) {
                    if (Math.random() < actionProb) {
                        store.toggleOpponentSelection(remaining[Math.floor(Math.random() * remaining.length)]);
                    }
                } else {
                    if (Math.random() < submitProb) {
                        store.updateOpponentScore(store.opponentScore + 1);
                        store.resetOpponentSelections();
                        const newCombo = store.opponentCombo + 1;
                        store.setOpponentCombo(newCombo);
                        if (newCombo >= 2) {
                            store.setOpponentCombo(0);
                            store.setPlayerEffect(getRandomObstruction());
                        }
                        const next = generateCpuProblem(store.cpuTarget);
                        store.updateCpuPattern(next.target, next.images);
                    }
                }
            } else {
                // BRモード CPU シミュレーション（完全 immutable）
                let changed = false;
                let brEffectToFire: ObstructionType = null;
                let brAttackerId: string | null = null;
                const nextOpponents: BROpponent[] = store.brOpponents.map(opp => {
                    if (opp.effect && shouldSkipWithObstruction()) return opp;

                    const correctIndices = getCorrectIndices(opp.images, opp.target);
                    const remaining = correctIndices.filter(i => !opp.selections.includes(i));

                    if (remaining.length > 0) {
                        if (Math.random() < actionProb) {
                            changed = true;
                            return { ...opp, selections: [...opp.selections, remaining[Math.floor(Math.random() * remaining.length)]] };
                        }
                        return opp;
                    } else {
                        if (Math.random() < submitProb) {
                            const newCombo = opp.combo + 1;
                            const fired = newCombo >= 2;
                            if (fired) {
                                if (!brEffectToFire) {
                                    brEffectToFire = getRandomObstruction();
                                    brAttackerId = opp.id;
                                }
                            }
                            const next = generateCpuProblem();
                            changed = true;
                            return { ...opp, score: opp.score + 1, selections: [], combo: fired ? 0 : newCombo, images: next.images, target: next.target };
                        }
                        return opp;
                    }
                });
                if (changed) {
                    store.setBROpponents(nextOpponents);
                }
                if (brEffectToFire) {
                    // brOpponents更新の後に適用し、effect が上書きで消えるのを防ぐ
                    fireBRObstruction(brEffectToFire, brAttackerId);
                }
            }
        }, intervalTime);

        return () => clearInterval(interval);
    }, [gameMode, gameState, cpuPlayerCount]);

    // ── 勝敗判定（1vs1: opponentScore を監視）──────────────────
    useEffect(() => {
        if (gameMode !== 'CPU' || gameState !== 'PLAYING' || cpuPlayerCount !== 1) return;
        if (opponentScore >= settingScore) {
            playLose();
            useGameStore.getState().endGame('cpu');
        }
    }, [opponentScore, gameMode, gameState, cpuPlayerCount, settingScore]);

    // ── ゲーム初期化 ─────────────────────────────────────────
    const confirmDifficulty = (level: number) => {
        playStart();
        const store = useGameStore.getState();
        store.setCpuDifficulty(level);
        setWinningScore(settingScore);
        store.setRoomInfo('LOCAL_CPU', store.playerId);
        setMyScore(() => 0);

        const myProb = generateCpuProblem();
        const cpuProb = generateCpuProblem();
        store.startGame(myProb.target, myProb.images);
        store.updateCpuPattern(cpuProb.target, cpuProb.images);

        if (cpuPlayerCount > 1) {
            const opponents: BROpponent[] = Array.from({ length: cpuPlayerCount - 1 }, (_, i) => {
                const prob = generateCpuProblem();
                return {
                    id: `CPU ${i + 1}`,
                    score: 0,
                    combo: 0,
                    effect: null,
                    selections: [],
                    images: prob.images,
                    target: prob.target,
                };
            });
            store.setBROpponents(opponents);
        }
    };

    // ── リロード ────────────────────────────────────────────
    const handleReload = () => {
        if (isReloading) return;
        setIsReloading(true);
        useGameStore.getState().resetMySelections();
        controller.scheduleReload(useGameStore.getState().playerId ?? 'local_reload', () => {
            const store = useGameStore.getState();
            const next = generateCpuProblem(store.target);
            store.updatePlayerPattern(next.target, next.images);
            setIsReloading(false);
        }, 1000);
    };

    // ── 回答検証（CPU用）────────────────────────────────────
    const handleVerifyCpu = (winningScore: number) => {
        // 最新の store 状態を取得（stale closure 回避）
        const store = useGameStore.getState();
        const correctIndices = getCorrectIndices(store.images, store.target);
        const isCorrect =
            store.mySelections.length === correctIndices.length &&
            store.mySelections.every(idx => correctIndices.includes(idx));

        if (isCorrect) {
            setMyScore(prev => {
                const nextScore = prev + 1;
                if (nextScore < winningScore) {
                    playSuccess();
                    store.setFeedback('CORRECT');
                    setTimeout(() => store.setFeedback(null), 1000);
                }
                return nextScore;
            });
            store.resetMySelections();

            // コンボ判定（最新値を getState() で取得して stale closure 回避）
            const newCombo = useGameStore.getState().playerCombo + 1;
            store.setPlayerCombo(newCombo);
            if (newCombo >= 2) {
                store.setPlayerCombo(0);
                const effect = getRandomObstruction();
                if (cpuPlayerCount === 1) {
                    store.setOpponentEffect(effect);
                } else {
                    // player is attacker; pass playerId so human isn't affected
                    fireBRObstruction(effect, store.playerId);
                }
            }

            const next = generateCpuProblem(store.target);
            store.updatePlayerPattern(next.target, next.images);
        } else {
            playError();
            store.setFeedback('WRONG');
            setTimeout(() => store.setFeedback(null), 1000);
            store.setPlayerCombo(0);
            store.resetMySelections();
        }
    };

    return {
        settingScore,
        setSettingScore,
        cpuPlayerCount,
        setCpuPlayerCount,
        isReloading,
        confirmDifficulty,
        handleReload,
        handleVerifyCpu,
    };
}
