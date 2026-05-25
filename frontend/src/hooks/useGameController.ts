import { useEffect, useRef } from 'react';

// Centralized timer/controller for small cross-cutting timers.

export function useGameController() {
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        return () => {
            for (const timer of timersRef.current.values()) {
                clearTimeout(timer);
            }
            timersRef.current.clear();
        };
    }, []);

    const setNamedTimeout = (key: string, fn: () => void, delay: number) => {
        const timers = timersRef.current;
        if (timers.has(key)) {
            clearTimeout(timers.get(key)!);
        }
        const t = setTimeout(() => {
            timers.delete(key);
            try { fn(); } catch (e) { console.error('timer callback error', e); }
        }, delay);
        timers.set(key, t);
        return t;
    };

    const clearNamedTimeout = (key: string) => {
        const timers = timersRef.current;
        const t = timers.get(key);
        if (t) {
            clearTimeout(t);
            timers.delete(key);
        }
    };

    return {
        // Generic named timer (overwrites same key)
        scheduleNamed: setNamedTimeout,
        clearNamed: clearNamedTimeout,

        // Helpers for common named timers
        scheduleStartPopupHide: (playerId: string, cb: () => void, delay = 500) =>
            setNamedTimeout(`startPopup:${playerId}`, cb, delay),

        scheduleVerifyFallback: (playerId: string, cb: () => void, delay = 5000) =>
            setNamedTimeout(`verifyFallback:${playerId}`, cb, delay),

        scheduleReload: (playerIdOrKey: string, cb: () => void, delay = 1000) =>
            setNamedTimeout(`reload:${playerIdOrKey}`, cb, delay),

        scheduleCopyReset: (roomId: string, cb: () => void, delay = 1800) =>
            setNamedTimeout(`copyReset:${roomId}`, cb, delay),

        scheduleNoticeHide: (key: string, cb: () => void, delay = 1400) =>
            setNamedTimeout(`notice:${key}`, cb, delay),
    }
}
