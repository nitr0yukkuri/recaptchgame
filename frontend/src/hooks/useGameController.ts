// Centralized timer/controller for small cross-cutting timers.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function setNamedTimeout(key: string, fn: () => void, delay: number) {
    if (timers.has(key)) {
        clearTimeout(timers.get(key)!);
    }
    const t = setTimeout(() => {
        timers.delete(key);
        try { fn(); } catch (e) { console.error('timer callback error', e); }
    }, delay);
    timers.set(key, t);
    return t;
}

function clearNamedTimeout(key: string) {
    const t = timers.get(key);
    if (t) {
        clearTimeout(t);
        timers.delete(key);
    }
}

export function useGameController() {
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
    };
}

export function clearAllTimersForPrefix(prefix: string) {
    for (const key of Array.from(timers.keys())) {
        if (key.startsWith(prefix)) clearNamedTimeout(key);
    }
}
