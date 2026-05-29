import { motion } from 'framer-motion';
import { useGameStore } from '../store';

type ResultScreenProps = {
    gameMode: 'CPU' | 'ONLINE' | null;
    onReplay?: () => void;
    onImmediateRematch?: () => void;
};

export const ResultScreen = ({ gameMode }: ResultScreenProps) => {
    const { winner, playerId, disconnected } = useGameStore();

    const isWin = winner === playerId || (winner === 'human' && gameMode === 'CPU');

    return (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-6 sm:space-y-10 py-4">
            {disconnected ? (
                // 相手切断による不戦勝
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-yellow-600 space-y-3 sm:space-y-6">
                    <div className="bg-yellow-100 w-24 h-24 sm:w-32 sm:h-32 rounded-full flex items-center justify-center mx-auto shadow-lg">
                        <span className="text-5xl sm:text-6xl">🎉</span>
                    </div>
                    <div>
                        <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-gray-800">勝利しました！</h2>
                        <p className="text-base sm:text-xl text-yellow-600 font-bold mt-1 sm:mt-2">対戦相手の接続が切れました</p>
                        <p className="text-xs sm:text-base text-gray-400 mt-1">相手が退出したため、あなたの勝利です。</p>
                    </div>
                </motion.div>
            ) : isWin ? (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-green-600 space-y-3 sm:space-y-6">
                    <div className="bg-green-100 w-24 h-24 sm:w-32 sm:h-32 rounded-full flex items-center justify-center mx-auto shadow-lg">
                        <span className="text-5xl sm:text-6xl">🎉</span>
                    </div>
                    <div>
                        <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-gray-800">You are Human!</h2>
                        <p className="text-base sm:text-xl text-gray-500 mt-1 sm:mt-3">人間であることが証明されました。</p>
                    </div>
                </motion.div>
            ) : (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-red-600 space-y-3 sm:space-y-6">
                    <div className="bg-red-100 w-24 h-24 sm:w-32 sm:h-32 rounded-full flex items-center justify-center mx-auto shadow-lg">
                        <span className="text-5xl sm:text-6xl">🤖</span>
                    </div>
                    <div>
                        <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-gray-800">DEFEAT</h2>
                        <p className="text-base sm:text-xl text-gray-500 mt-1 sm:mt-3">敗北しました...</p>
                    </div>
                </motion.div>
            )}
            <button
                onClick={() => {
                    if (typeof (window as any).__onReplay === 'function') {
                        (window as any).__onReplay();
                    } else {
                        // fallback: full reload if no handler provided
                        window.location.reload();
                    }
                }}
                className="px-6 py-3 sm:px-10 sm:py-5 bg-gray-900 text-white rounded-2xl font-bold text-base sm:text-xl hover:bg-black transition shadow-2xl"
            >
                もう一度プレイ
            </button>
            {/* 即時再戦オプション（プライベートマッチ向け） */}
            {gameMode === 'ONLINE' && (window as any).__onImmediateRematch && (
                <button
                    onClick={() => { try { (window as any).__onImmediateRematch(); } catch (e) { /* ignore */ } }}
                    className="mt-3 px-6 py-2 sm:px-8 sm:py-3 bg-white text-gray-800 border border-gray-200 rounded-2xl font-semibold text-sm sm:text-base hover:bg-gray-50 transition"
                >
                    今すぐ再戦
                </button>
            )}
        </div>
    );
};
