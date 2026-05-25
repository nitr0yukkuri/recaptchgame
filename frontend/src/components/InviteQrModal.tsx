import React from 'react';
import QRCode from 'qrcode.react';

type Props = {
    roomId: string;
    onClose: () => void;
};

export const InviteQrModal: React.FC<Props> = ({ roomId, onClose }) => {
    const origin = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
    const url = `${origin}?room=${encodeURIComponent(roomId)}`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
        } catch (e) {
            console.warn('clipboard copy failed', e);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg p-4 w-[320px] max-w-[90%] text-center">
                <h3 className="font-bold mb-2">招待リンク (友達対戦)</h3>
                <div className="flex justify-center mb-2">
                    <QRCode value={url} size={200} />
                </div>
                <p className="text-sm break-all mb-3">{url}</p>
                <div className="flex gap-2 justify-center">
                    <button onClick={handleCopy} className="px-3 py-1 bg-gray-100 rounded">URLをコピー</button>
                    <button onClick={onClose} className="px-3 py-1 bg-blue-500 text-white rounded">閉じる</button>
                </div>
            </div>
        </div>
    );
};

export default InviteQrModal;
