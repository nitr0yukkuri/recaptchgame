import { motion } from 'framer-motion';
import { useGameStore } from '../store';

type ResultScreenProps = {
    gameMode: 'CPU' | 'ONLINE' | null;
};

export const ResultScreen = ({ gameMode }: ResultScreenProps) => {
    const { winner, playerId } = useGameStore();

    return (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-10">
            {winner === playerId || (winner === 'human' && gameMode === 'CPU') ? (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-green-600 space-y-6">
                    <div className="bg-green-100 w-32 h-32 rounded-full flex items-center justify-center mx-auto shadow-lg">
                        <span className="text-6xl">🎉</span>
                    </div>
                    <div>
                        <h2 className="text-4xl md:text-5xl font-bold text-gray-800">You are Human!</h2>
                        <p className="text-xl text-gray-500 mt-3">人間であることが証明されました。</p>
                    </div>
                </motion.div>
            ) : (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-red-600 space-y-6">
                    <div className="bg-red-100 w-32 h-32 rounded-full flex items-center justify-center mx-auto shadow-lg">
                        <span className="text-6xl">🤖</span>
                    </div>
                    <div>
                        <h2 className="text-4xl md:text-5xl font-black text-gray-800">DEFEAT</h2>
                        <p className="text-xl text-gray-500 mt-3">敗北しました...</p>
                    </div>
                </motion.div>
            )}
            <button
                onClick={() => window.location.reload()}
                className="px-10 py-5 bg-gray-900 text-white rounded-2xl font-bold text-xl hover:bg-black transition shadow-2xl"
            >
                もう一度プレイ
            </button>
        </div>
    );
};
