import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function App() {
    const [images, setImages] = useState(Array(9).fill(null));
    const [selected, setSelected] = useState<number[]>([]);
    const [isBot, setIsBot] = useState(false);

    // 100ms以内の低遅延通信用 (要件2.2)
    const [ws, setWs] = useState<WebSocket | null>(null);

    useEffect(() => {
        const socket = new WebSocket(`ws://${window.location.host}/ws`);
        setWs(socket);
        return () => socket.close();
    }, []);

    const toggleSelect = (index: number) => {
        setSelected(prev =>
            prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
        );
        ws?.send(JSON.stringify({ type: 'SELECT_IMAGE', payload: { image_index: index } }));
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 font-sans">
            <div className="bg-white shadow-lg p-2 max-w-sm w-full border border-gray-300">
                <div className="bg-[#4A90E2] p-6 text-white mb-2">
                    <p className="text-sm">お題を選択してください：</p>
                    <p className="text-2xl font-bold leading-tight">消火栓</p>
                    <p className="text-xs mt-1">すべて選択したら [確認] を押してください</p>
                </div>

                <div className="grid grid-cols-3 gap-1 mb-2 bg-gray-200">
                    {images.map((_, i) => (
                        <motion.div
                            key={i}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => toggleSelect(i)}
                            className="relative aspect-square bg-gray-400 cursor-pointer overflow-hidden"
                        >
                            <img src={`https://picsum.photos/200?sig=${i}`} alt="captcha" className="w-full h-full object-cover" />
                            {selected.includes(i) && (
                                <div className="absolute inset-0 bg-white/40 flex items-center justify-center border-4 border-[#4A90E2]">
                                    <div className="bg-[#4A90E2] rounded-full p-1">
                                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>

                <div className="flex justify-between items-center p-2 border-t">
                    <div className="flex space-x-4 text-gray-500">
                        {/* アイコン類 */}
                        <div className="w-5 h-5 bg-gray-300 rounded-sm" />
                    </div>
                    <button
                        onClick={() => setIsBot(true)}
                        className="bg-[#4A90E2] text-white px-6 py-2 font-bold rounded-sm text-sm hover:bg-blue-600 active:bg-blue-700"
                    >
                        確認
                    </button>
                </div>
            </div>

            {/* デバフ演出用オーバーレイ (要件2.1.3) */}
            {isBot && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center text-white text-4xl font-black">
                    お前はボットだ
                </div>
            )}
        </div>
    );
}