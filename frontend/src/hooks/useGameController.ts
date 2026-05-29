import { useEffect } from 'react';

// Centralized timer/controller for small cross-cutting timers.
// NOTE: multiple React components were each creating independent controllers
// which prevented clearing timers from other contexts. To keep minimal changes
// we provide a hook that returns a singleton controller shared across the app.

type TimerMap = Map<string, ReturnType<typeof setTimeout>>;

const globalTimers: TimerMap = new Map();

function clearAllTimers(map: TimerMap) {
    for (const t of map.values()) {
        clearTimeout(t);
    }
    map.clear();
}

// ensure timers are cleaned on page unload to avoid leaks in dev/hmr
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => clearAllTimers(globalTimers));
}

export function useGameController() {
    useEffect(() => {
        return () => {
            // do not clear all timers on each component unmount; timers are global
            // but ensure any noop here keeps parity with previous hook semantics.
        };
    }, []);

    const setNamedTimeout = (key: string, fn: () => void, delay: number) => {
        if (globalTimers.has(key)) {
            clearTimeout(globalTimers.get(key)!);
        }
        const t = setTimeout(() => {
            globalTimers.delete(key);
            try { fn(); } catch (e) { console.error('timer callback error', e); }
        }, delay);
        globalTimers.set(key, t);
        return t;
    };

    const clearNamedTimeout = (key: string) => {
        const t = globalTimers.get(key);
        if (t) {
            clearTimeout(t);
            globalTimers.delete(key);
        }
    };

    return {
        scheduleNamed: setNamedTimeout,
        clearNamed: clearNamedTimeout,

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

        // Diagnostics / test helper
        _clearAll: () => clearAllTimers(globalTimers),
    };
}
