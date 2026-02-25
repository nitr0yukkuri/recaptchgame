import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useGameStore } from '../store';
import { OnionRain } from './OnionRain';

type GameScreenProps = {
    myScore: number;
    winningScore: number;
    gameMode: 'CPU' | 'ONLINE' | null;
    isReloading: boolean;
    isVerifying: boolean;
    handleImageClick: (index: number) => void;
    handleReload: () => void;
    handleVerify: () => void;
};

const obstructionVariants: Variants = {
    SHAKE: { x: [-15, 15, -15, 15, 0], transition: { repeat: Infinity, duration: 0.5 } },
    SPIN: { rotate: 360, transition: { repeat: Infinity, duration: 0.5, ease: "linear" } },
    SKEW: { skewX: [-20, 20, -20], transition: { repeat: Infinity, duration: 0.5, ease: "easeInOut" } },
    BLUR: {},
    INVERT: {},
    GRAYSCALE: {},
    SEPIA: {},
    ONION_RAIN: {},
    NORMAL: { x: 0, rotate: 0, skewX: 0 }
};

export const GameScreen = ({
    myScore, winningScore, gameMode,
    isReloading, isVerifying,
    handleImageClick, handleReload, handleVerify
}: GameScreenProps) => {
    const {
        target, images, playerCombo, opponentCombo, playerEffect, opponentEffect,
        mySelections, opponentSelections, opponentScore, cpuImages, cpuDifficulty
    } = useGameStore();

    const rivalImages = gameMode === 'CPU' ? cpuImages : cpuImages;

    return (
        <div className="flex flex-col h-full justify-start pt-12 pb-20">
            <div className="bg-[#5B46F5] text-white px-5 py-3 rounded-2xl mb-4 shadow-md shrink-0 text-left flex flex-col justify-center mx-4 md:mx-auto w-auto md:w-full max-w-2xl">
                <p className="text-xs opacity-90 font-medium mb-0.5">以下の画像をすべて選択：</p>
                <h2 className="text-xl md:text-2xl font-bold uppercase tracking-wider leading-none">{target}</h2>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 w-full max-w-6xl mx-auto px-4">
                <div className="flex flex-col items-center w-full max-w-[400px] shrink-0 z-10">
                    <h3 className="text-xl md:text-2xl font-bold text-gray-700 mb-2">自分 {playerCombo > 0 && <span className="text-orange-500">Combo: {playerCombo}</span>}</h3>

                    <motion.div
                        variants={obstructionVariants}
                        animate={['SHAKE', 'SPIN', 'SKEW'].includes(playerEffect || '') ? (playerEffect as string) : 'NORMAL'}
                        className={`relative overflow-hidden bg-white rounded-sm p-2 shadow-sm w-full border border-gray-300 flex flex-col 
                            ${playerEffect === 'BLUR' ? 'blur-[4px]' : ''} 
                            ${playerEffect === 'INVERT' ? 'invert' : ''}
                            ${playerEffect === 'GRAYSCALE' ? 'grayscale' : ''}
                            ${playerEffect === 'SEPIA' ? 'sepia' : ''}
                        `}
                    >
                        {playerEffect === 'ONION_RAIN' && <OnionRain />}

                        <AnimatePresence>
                            {(isReloading || isVerifying) && (
                                <motion.div
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-30 bg-white/80 flex items-center justify-center"
                                >
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5B46F5]"></div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="grid grid-cols-3 gap-1 w-full aspect-square">
                            {images.map((img: string, idx: number) => (
                                <div
                                    key={idx}
                                    onClick={() => handleImageClick(idx)}
                                    className="relative w-full h-full cursor-pointer overflow-hidden group bg-gray-100"
                                >
                                    <div className={`w-full h-full transition-transform duration-100 ${mySelections.includes(idx) ? 'scale-75 origin-bottom-right' : 'scale-100 origin-center group-hover:opacity-90'}`}>
                                        <img
                                            src={img}
                                            alt="captcha"
                                            className="w-full h-full object-cover aspect-square block"
                                        />
                                    </div>

                                    {mySelections.includes(idx) && (
                                        <div className="absolute top-0 left-0 text-white bg-[#4285F4] rounded-full p-0.5 m-1 shadow-md z-10">
                                            <svg className="w-3 h-3 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center mt-4 px-2 w-full">
                            <button
                                onClick={handleReload}
                                disabled={isReloading || isVerifying}
                                className="p-2 text-gray-400 hover:text-[#5B46F5] hover:bg-gray-100 rounded-full transition duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <svg className={`w-6 h-6 ${isReloading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>

                            <button
                                onClick={handleVerify}
                                disabled={isReloading || isVerifying}
                                className="bg-[#4285F4] hover:bg-[#3367D6] disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded text-sm uppercase tracking-wide transition shadow-sm active:shadow-inner z-20 relative mr-8"
                            >
                                {isVerifying ? '判定中...' : '確認'}
                            </button>
                            <div className="w-6"></div>
                        </div>
                    </motion.div>
                </div>

                <div className="flex flex-col justify-center items-center shrink-0 w-full md:w-auto">
                    <h3 className="text-xl md:text-2xl font-bold text-gray-700 mb-2">相手 {opponentCombo > 0 && <span className="text-orange-500">Combo: {opponentCombo}</span>}</h3>

                    <motion.div
                        variants={obstructionVariants}
                        animate={['SHAKE', 'SPIN', 'SKEW'].includes(opponentEffect || '') ? (opponentEffect as string) : 'NORMAL'}
                        className={`relative overflow-hidden bg-gray-100 rounded-sm p-2 flex flex-col items-center shadow-inner w-[200px] md:w-48 border border-gray-300 
                            ${opponentEffect === 'BLUR' ? 'blur-[4px]' : ''} 
                            ${opponentEffect === 'INVERT' ? 'invert' : ''}
                            ${opponentEffect === 'GRAYSCALE' ? 'grayscale' : ''}
                            ${opponentEffect === 'SEPIA' ? 'sepia' : ''}
                        `}
                    >
                        {opponentEffect === 'ONION_RAIN' && <OnionRain />}

                        <div className="flex items-center gap-2 mb-2 w-full justify-center">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                            <p className="text-xs font-bold text-gray-500">RIVAL VIEW</p>
                        </div>
                        <div className="grid grid-cols-3 gap-0.5 w-full opacity-90">
                            {rivalImages.map((img: string, idx: number) => (
                                <div
                                    key={`opp-${idx}`}
                                    className="relative aspect-square overflow-hidden bg-gray-300"
                                >
                                    <div className={`w-full h-full transition-transform duration-100 ${opponentSelections.includes(idx) ? 'scale-75' : ''}`}>
                                        <img src={img} className="w-full h-full object-cover aspect-square block" />
                                    </div>
                                    {opponentSelections.includes(idx) && (
                                        <div className="absolute top-0 left-0 bg-[#4285F4] rounded-full p-0.5 m-0.5 z-10">
                                            <svg className="w-2 h-2 md:w-3 md:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>

            <div className="w-full max-w-4xl mx-auto px-4 mt-8">
                <div className="flex justify-between items-center text-lg md:text-xl font-bold text-gray-600 bg-white/80 p-3 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3">
                        <span className="w-4 h-4 rounded-full bg-green-500 shadow-sm"></span>
                        You: {myScore}/{winningScore}
                    </div>
                    <div className="flex-1 mx-4 md:mx-6 h-4 bg-gray-200 rounded-full overflow-hidden relative shadow-inner">
                        <div
                            className="absolute top-0 left-0 h-full bg-[#5B46F5] transition-all duration-500 ease-out"
                            style={{ width: `${(myScore / winningScore) * 100}%` }}
                        ></div>
                    </div>
                    <div className="flex items-center gap-3">
                        {gameMode === 'CPU' ? (cpuDifficulty === 3 ? 'CPU (つよい)' : (cpuDifficulty === 1 ? 'CPU (よわい)' : 'CPU (ふつう)')) : 'Rival'}: {opponentScore}/{winningScore}
                        <span className="w-4 h-4 rounded-full bg-red-500 shadow-sm"></span>
                    </div>
                </div>
            </div>
        </div>
    );
};
