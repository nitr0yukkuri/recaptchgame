import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameController } from '../hooks/useGameController';
import { QRCodeSVG } from 'qrcode.react';

type WaitingScreenProps = {
    roomId: string;
    isRandomMatch?: boolean;
    cancelWaiting: () => void;
};

const ROOM_ID_PATTERN = /^[A-Za-z0-9]{6}$/;

const buildInviteUrl = (roomId: string) => {
    if (typeof window === 'undefined') {
        return { url: null, error: 'QRコードはブラウザ上でのみ生成できます。' };
    }

    if (!ROOM_ID_PATTERN.test(roomId)) {
        return { url: null, error: 'QRコードは有効なルームIDでのみ生成できます。' };
    }

    return {
        url: `${window.location.origin}/?room=${encodeURIComponent(roomId)}`,
        error: null,
    };
};

export const WaitingScreen = ({ roomId, isRandomMatch = false, cancelWaiting }: WaitingScreenProps) => {
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
    const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const controller = useGameController();

    const invite = useMemo(() => buildInviteUrl(roomId), [roomId]);

    useEffect(() => {
        setCopyState('idle');
    }, [roomId]);

    useEffect(() => {
        return () => {
            controller.clearNamed(`copyReset:${roomId}`);
        };
    }, [controller, roomId]);

    const handleCopy = async () => {
        if (!invite.url) {
            setCopyState('error');
            return;
        }

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(invite.url);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = invite.url;
                textarea.readOnly = true;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            setCopyState('copied');
            if (copyResetTimerRef.current !== null) {
                controller.clearNamed(`copyReset:${roomId}`);
            }
            copyResetTimerRef.current = controller.scheduleCopyReset(roomId, () => {
                setCopyState(prev => (prev === 'copied' ? 'idle' : prev));
            }, 1800);
        } catch {
            setCopyState('error');
        }
    };

    if (isRandomMatch) {
        return (
            <div className="text-center h-full flex flex-col items-center justify-center space-y-10">
                <div className="animate-spin h-20 w-20 border-8 border-[#5B46F5] border-t-transparent rounded-full mx-auto"></div>
                <div>
                    <p className="text-3xl font-bold text-gray-700">対戦相手を待機中...</p>
                </div>
                <button
                    onClick={cancelWaiting}
                    className="inline-block px-8 py-3 text-gray-500 font-bold hover:text-white hover:bg-gray-400 rounded-full border-2 border-gray-300 transition cursor-pointer z-50 pointer-events-auto"
                >
                    キャンセル
                </button>
            </div>
        );
    }

    return (
        <div className="h-full flex items-center justify-center px-2 py-4 sm:px-4 sm:py-8">
            <div className="w-full max-w-xl rounded-3xl border border-gray-100 bg-white shadow-xl px-4 py-4 md:px-8 md:py-8 text-center space-y-4 sm:space-y-6">
                <div className="space-y-2 sm:space-y-4">
                    <div className="mx-auto animate-spin h-10 w-10 sm:h-14 sm:w-14 md:h-20 md:w-20 border-4 md:border-8 border-[#5B46F5] border-t-transparent rounded-full"></div>
                    <div>
                        <p className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-700">対戦相手を待機中...</p>
                        <p className="text-xs sm:text-sm md:text-lg text-gray-400 mt-1 break-all">Room: {roomId}</p>
                    </div>
                </div>

                <div className="rounded-2xl sm:rounded-3xl border border-gray-100 bg-[#F9F9F7] p-3 md:p-6 space-y-3 sm:space-y-4">
                    <div className="space-y-1">
                        <p className="text-xs font-bold tracking-widest text-[#5B46F5] uppercase">QR Invite</p>
                        <p className="text-xs sm:text-sm md:text-lg font-semibold text-gray-700">スマホで読み取って、同じ部屋にそのまま参加</p>
                    </div>

                    {invite.url ? (
                        <div className="mx-auto w-fit rounded-2xl bg-white p-2.5 sm:p-4 shadow-sm ring-1 ring-gray-100">
                            <QRCodeSVG
                                value={invite.url}
                                size={256}
                                style={{ width: '100%', height: 'auto', maxWidth: '140px', sm: { maxWidth: '180px' } } as any}
                                level="M"
                                bgColor="#FFFFFF"
                                fgColor="#111827"
                                includeMargin
                                aria-label="ルーム参加用QRコード"
                            />
                        </div>
                    ) : (
                        <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs sm:text-sm font-medium text-amber-800">
                            {invite.error}
                        </div>
                    )}

                    <div className="rounded-xl bg-white border border-gray-200 px-3 py-2 text-left">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">参加用URL</p>
                        <p className="text-xs sm:text-sm text-gray-600 break-all">
                            {invite.url ?? '有効なルームIDが必要です'}
                        </p>
                    </div>

                    <button
                        onClick={handleCopy}
                        disabled={!invite.url}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl sm:rounded-2xl font-bold transition border-2 border-[#5B46F5] text-[#5B46F5] hover:bg-[#5B46F5] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#5B46F5] text-sm sm:text-base"
                    >
                        <span>URLをコピー</span>
                        <span className="text-xs opacity-85">
                            {copyState === 'copied' ? 'コピー済み' : copyState === 'error' ? 'コピー失敗' : 'ワンタップ'}
                        </span>
                    </button>
                </div>

                <button
                    onClick={cancelWaiting}
                    className="inline-block px-6 py-2 sm:px-8 sm:py-3 text-gray-500 font-bold hover:text-white hover:bg-gray-400 rounded-full border-2 border-gray-300 transition cursor-pointer z-50 pointer-events-auto text-sm sm:text-base"
                >
                    キャンセル
                </button>
            </div>
        </div>
    );
};
