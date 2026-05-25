import { useEffect, useRef, useState } from 'react';
import { useGameStore, ObstructionType } from '../store';

interface UseObstructionEffectOptions {
    playObstruction: () => void;
}

/**
 * 妨害エフェクトのライフサイクルを一元管理するフック。
 * - playerEffect / opponentEffect の3秒後自動クリア
 * - BRモードで自分が妨害発動したとき全対戦相手に effect をセット＋個別タイマーでクリア
 * - 妨害発動バナー用ステート管理
 */
export function useObstructionEffect({ playObstruction }: UseObstructionEffectOptions) {
    const { playerEffect, opponentEffect, playerEffectToken, opponentEffectToken, setPlayerEffect, setOpponentEffect } = useGameStore();

    // 各BROpponentのeffectクリア用タイマー (id → timer)
    const brEffectTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    // 自分がBR妨害発動したときのバナー用
    const [brAttackEffect, setBRAttackEffect] = useState<ObstructionType>(null);
    const brAttackBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // playerEffect → サウンド再生 + 3秒後クリア
    useEffect(() => {
        if (!playerEffect) return;
        playObstruction();
        const token = playerEffectToken;
        const t = setTimeout(() => {
            if (useGameStore.getState().playerEffectToken === token) {
                setPlayerEffect(null);
            }
        }, 3000);
        // Safety fallback: if something prevents the 3s clear, ensure effect cleared within 4s
        const fallback = setTimeout(() => {
            const state = useGameStore.getState();
            if (state.playerEffect && state.playerEffectToken === token) {
                console.warn('playerEffect fallback cleared after 4s');
                setPlayerEffect(null);
            }
        }, 4000);
        return () => {
            clearTimeout(t);
            clearTimeout(fallback);
        };
    }, [playerEffect, playerEffectToken, setPlayerEffect, playObstruction]);

    // opponentEffect → 3秒後クリア
    useEffect(() => {
        if (!opponentEffect) return;
        const token = opponentEffectToken;
        const t = setTimeout(() => {
            if (useGameStore.getState().opponentEffectToken === token) {
                setOpponentEffect(null);
            }
        }, 3000);
        const fallback = setTimeout(() => {
            const state = useGameStore.getState();
            if (state.opponentEffect && state.opponentEffectToken === token) {
                console.warn('opponentEffect fallback cleared after 4s');
                setOpponentEffect(null);
            }
        }, 4000);
        return () => {
            clearTimeout(t);
            clearTimeout(fallback);
        };
    }, [opponentEffect, opponentEffectToken, setOpponentEffect]);

    // cleanup on unmount: clear any player/br timers
    useEffect(() => {
        return () => {
            const timers = brEffectTimersRef.current;
            Object.values(timers).forEach(t => clearTimeout(t));
            if (brAttackBannerTimerRef.current) clearTimeout(brAttackBannerTimerRef.current);
        };
    }, []);

    /**
     * BRモードで自分が妨害発動したとき呼ぶ。
     * 全brOpponentsにeffectをセットし、個別タイマーで3秒後にクリア。
     * バナーも3秒間表示。
     */
    const fireBRObstruction = (effect: ObstructionType, attackerId?: string | null) => {
        const store = useGameStore.getState();

        // Apply effect to BR opponents, but skip attacker if attackerId provided
        const updated = store.brOpponents.map(opp => (attackerId && opp.id === attackerId) ? opp : { ...opp, effect });
        store.setBROpponents(updated);

        // 既存タイマーをリセットして再セット（攻撃者にはタイマーを設定しない）
        const timers = brEffectTimersRef.current;
        updated.forEach(opp => {
            // clear any existing timer for this opponent
            if (timers[opp.id]) { clearTimeout(timers[opp.id]); delete timers[opp.id]; }
            // skip attacker: do not set effect timer for attacker
            if (attackerId && opp.id === attackerId) {
                return;
            }
            timers[opp.id] = setTimeout(() => {
                useGameStore.getState().setBROpponentEffect(opp.id, null);
                delete timers[opp.id];
            }, 3000);
        });

        // 自分（local player）への effect は攻撃者なら適用しない
        if (!attackerId || store.playerId !== attackerId) {
            store.setPlayerEffect(effect);
        }

        // バナー表示 (自分が攻撃者の片方の場合のみ表示)
        if (store.playerId === attackerId) {
            setBRAttackEffect(effect);
            if (brAttackBannerTimerRef.current) clearTimeout(brAttackBannerTimerRef.current);
            brAttackBannerTimerRef.current = setTimeout(() => setBRAttackEffect(null), 3000);
        }
    };
    const showBRAttack = (effect: ObstructionType) => {
        setBRAttackEffect(effect);
        if (brAttackBannerTimerRef.current) clearTimeout(brAttackBannerTimerRef.current);
        brAttackBannerTimerRef.current = setTimeout(() => setBRAttackEffect(null), 3000);
    };

    return { brAttackEffect, fireBRObstruction, showBRAttack };
}

