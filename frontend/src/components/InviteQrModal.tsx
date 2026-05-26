import React from 'react';

type Props = {
    roomId: string;
    onClose: () => void;
};

export const InviteQrModal: React.FC<Props> = () => {
    // QRコードはWaitingScreenのパネル内に戻したため、このモーダル（背景表示）は非表示にします。
    return null;
};

export default InviteQrModal;
