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
    const { playerEffect, opponentEffect, setPlayerEffect, setOpponentEffect } = useGameStore();

    // 各BROpponentのeffectクリア用タイマー (id → timer)
    const brEffectTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    // 自分がBR妨害発動したときのバナー用
    const [brAttackEffect, setBRAttackEffect] = useState<ObstructionType>(null);
    const brAttackBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // playerEffect → サウンド再生 + 3秒後クリア
    useEffect(() => {
        if (!playerEffect) return;
        playObstruction();
        const t = setTimeout(() => setPlayerEffect(null), 3000);
        // Safety fallback: if something prevents the 3s clear, ensure effect cleared within 10s
        const fallback = setTimeout(() => setPlayerEffect(null), 10000);
        return () => {
            clearTimeout(t);
            clearTimeout(fallback);
        };
    }, [playerEffect, setPlayerEffect, playObstruction]);

    // opponentEffect → 3秒後クリア
    useEffect(() => {
        if (!opponentEffect) return;
        const t = setTimeout(() => setOpponentEffect(null), 3000);
        const fallback = setTimeout(() => setOpponentEffect(null), 10000);
        return () => {
            clearTimeout(t);
            clearTimeout(fallback);
        };
    }, [opponentEffect, setOpponentEffect]);

    /**
     * BRモードで自分が妨害発動したとき呼ぶ。
     * 全brOpponentsにeffectをセットし、個別タイマーで3秒後にクリア。
     * バナーも3秒間表示。
     */
    const fireBRObstruction = (effect: ObstructionType) => {
        const store = useGameStore.getState();
        const updated = store.brOpponents.map(opp => ({ ...opp, effect }));
        store.setBROpponents(updated);

        // 既存タイマーをリセットして再セット
        const timers = brEffectTimersRef.current;
        updated.forEach(opp => {
            if (timers[opp.id]) clearTimeout(timers[opp.id]);
            timers[opp.id] = setTimeout(() => {
                useGameStore.getState().setBROpponentEffect(opp.id, null);
                delete timers[opp.id];
            }, 3000);
        });

        // バナー表示
        setBRAttackEffect(effect);
        if (brAttackBannerTimerRef.current) clearTimeout(brAttackBannerTimerRef.current);
        brAttackBannerTimerRef.current = setTimeout(() => setBRAttackEffect(null), 3000);
    };

    return { brAttackEffect, fireBRObstruction };
}
