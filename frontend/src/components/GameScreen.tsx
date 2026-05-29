import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useGameStore } from '../store';
import { OnionRain } from './OnionRain';
import { parseSplitTileIndex, resolveImageSrc } from '../utils/game';

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

const getSplitTileStyle = (tileIndex: number) => {
    const row = Math.floor(tileIndex / 3);
    const col = tileIndex % 3;

    return {
        width: '300%',
        height: '300%',
        maxWidth: 'none',
        maxHeight: 'none',
        position: 'absolute' as const,
        left: `${-col * 100}%`,
        top: `${-row * 100}%`,
    };
};

const renderCaptchaImage = (img: string, className: string) => {
    const resolved = resolveImageSrc(img);
    const splitTileIndex = parseSplitTileIndex(resolved);

    if (splitTileIndex === null) {
        return <img src={resolved} alt="captcha" className={className} />;
    }

    // src から #tile= フラグメントを除いた純粋なパスを取得
    const srcWithoutFragment = resolved.split('#')[0];
    return (
        <div className="relative w-full h-full overflow-hidden">
            <img
                src={srcWithoutFragment}
                alt="captcha"
                className={className}
                style={getSplitTileStyle(splitTileIndex)}
            />
        </div>
    );
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
        <div className="flex flex-col h-full justify-start pt-3 sm:pt-6 md:pt-12 pb-4 sm:pb-8 md:pb-20">
            <div className="bg-[#5B46F5] text-white px-4 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl mb-2 sm:mb-4 shadow-md shrink-0 text-left flex flex-col justify-center mx-2 sm:mx-4 md:mx-auto w-auto md:w-full max-w-2xl">
                <p className="text-[10px] sm:text-xs opacity-90 font-medium mb-0.5">以下の画像をすべて選択：</p>
                <h2 className="text-base sm:text-xl md:text-2xl font-bold uppercase tracking-wider leading-none">{target}</h2>
            </div>

            <div className="flex flex-row items-center md:items-start justify-center gap-2 sm:gap-6 md:gap-24 w-full max-w-3xl mx-auto px-1 sm:px-4">
                <div className="flex flex-col items-center w-[210px] xs:w-[240px] sm:w-[300px] md:w-[400px] shrink-0 z-10">
                    <h3 className="text-xs sm:text-lg md:text-2xl font-bold text-gray-700 mb-1 sm:mb-2">自分 {playerCombo > 0 && <span className="text-orange-500 text-[10px] sm:text-xs md:text-base">Combo: {playerCombo}</span>}</h3>

                    <motion.div
                        variants={obstructionVariants}
                        // プレイヤー側の画像が意図せず回転しないよう、
                        // `SPIN` 効果はプレイヤー本体には適用しない（代わりに NORMAL を使う）
                        animate={playerEffect === 'SPIN' ? 'NORMAL' : (['SHAKE', 'SPIN', 'SKEW'].includes(playerEffect || '') ? (playerEffect as string) : 'NORMAL')}
                        className={`relative overflow-hidden bg-white rounded-lg p-1 sm:p-2 shadow-sm w-full border border-gray-300 flex flex-col 
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
                                    <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-[#5B46F5]"></div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 w-full aspect-square">
                            {(images || []).map((img: string, idx: number) => (
                                <div
                                    key={idx}
                                    onClick={() => handleImageClick(idx)}
                                    className="relative w-full h-full cursor-pointer overflow-hidden group bg-gray-100"
                                >
                                    <div className={`w-full h-full origin-center transition-transform duration-150 ease-out ${mySelections.includes(idx) ? 'scale-90' : 'scale-100 group-hover:opacity-90'}`}>
                                        {renderCaptchaImage(img, 'w-full h-full object-contain sm:object-cover aspect-square block')}
                                    </div>

                                    {mySelections.includes(idx) && (
                                        <div className="absolute top-0 left-0 text-white bg-[#4285F4] rounded-full p-0.5 m-0.5 sm:m-1 shadow-md z-10">
                                            <svg className="w-2.5 h-2.5 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center mt-2 sm:mt-4 px-1 sm:px-2 w-full">
                            <button
                                onClick={handleReload}
                                disabled={isReloading || isVerifying}
                                className="p-1 sm:p-2 text-gray-400 hover:text-[#5B46F5] hover:bg-gray-100 rounded-full transition duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <svg className={`w-4 h-4 sm:w-6 sm:h-6 ${isReloading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>

                            <button
                                onClick={handleVerify}
                                disabled={isReloading || isVerifying}
                                className="bg-[#4285F4] hover:bg-[#3367D6] disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-1 sm:py-2 px-3 sm:px-6 rounded text-[10px] sm:text-sm uppercase tracking-wide transition shadow-sm active:shadow-inner z-20 relative"
                            >
                                {isVerifying ? '判定中...' : '確認'}
                            </button>
                            <div className="w-6 sm:w-10"></div>
                        </div>
                    </motion.div>
                </div>

                <div className="flex flex-col justify-center items-center shrink-0 w-[100px] xs:w-[115px] sm:w-[150px] md:w-48 mt-0 md:mt-20">
                    <h3 className="text-xs sm:text-lg md:text-2xl font-bold text-gray-700 mb-1 sm:mb-2">相手 {opponentCombo > 0 && <span className="text-orange-500 text-[10px] sm:text-xs md:text-base">Combo: {opponentCombo}</span>}</h3>

                    <motion.div
                        variants={obstructionVariants}
                        animate={['SHAKE', 'SPIN', 'SKEW'].includes(opponentEffect || '') ? (opponentEffect as string) : 'NORMAL'}
                        className={`relative overflow-hidden bg-gray-100 rounded-lg p-1 sm:p-2 flex flex-col items-center shadow-inner w-full border border-gray-300 
                            ${opponentEffect === 'BLUR' ? 'blur-[4px]' : ''} 
                            ${opponentEffect === 'INVERT' ? 'invert' : ''}
                            ${opponentEffect === 'GRAYSCALE' ? 'grayscale' : ''}
                            ${opponentEffect === 'SEPIA' ? 'sepia' : ''}
                        `}
                    >
                        {opponentEffect === 'ONION_RAIN' && <OnionRain />}

                        <div className="flex items-center gap-1 mb-1 sm:mb-2 w-full justify-center">
                            <span className="w-1 h-1 sm:w-2 sm:h-2 rounded-full bg-red-500 animate-pulse"></span>
                            <p className="text-[8px] sm:text-[10px] md:text-xs font-bold text-gray-500">RIVAL VIEW</p>
                        </div>
                        <div className="grid grid-cols-3 gap-0.5 w-full opacity-90">
                            {(rivalImages || []).map((img: string, idx: number) => (
                                <div
                                    key={`opp-${idx}`}
                                    className="relative aspect-square overflow-hidden bg-gray-300"
                                >
                                    <div className={`w-full h-full origin-center transition-transform duration-150 ease-out ${opponentSelections.includes(idx) ? 'scale-90' : 'scale-100'}`}>
                                        {renderCaptchaImage(img, 'w-full h-full object-cover aspect-square block')}
                                    </div>
                                    {opponentSelections.includes(idx) && (
                                        <div className="absolute top-0 left-0 bg-[#4285F4] rounded-full p-0.5 m-0.5 z-10">
                                            <svg className="w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-3 md:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>

            <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 mt-3 sm:mt-6">
                <div className="flex justify-between items-center text-xs sm:text-sm md:text-xl font-bold text-gray-600 bg-white/80 p-2 sm:p-3 rounded-lg sm:rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-1.5 sm:gap-3">
                        <span className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-green-500 shadow-sm"></span>
                        You: {myScore}/{winningScore}
                    </div>
                    <div className="flex-1 mx-2 sm:mx-4 md:mx-6 h-2 sm:h-4 bg-gray-200 rounded-full overflow-hidden relative shadow-inner">
                        <div
                            className="absolute top-0 left-0 h-full bg-[#5B46F5] transition-all duration-500 ease-out"
                            style={{ width: `${(myScore / winningScore) * 100}%` }}
                        ></div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-3">
                        {gameMode === 'CPU' ? (cpuDifficulty === 3 ? 'CPU (つよい)' : (cpuDifficulty === 1 ? 'CPU (よわい)' : 'CPU (ふつう)')) : 'Rival'}: {opponentScore}/{winningScore}
                        <span className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-red-500 shadow-sm"></span>
                    </div>
                </div>
            </div>
        </div>
    );
};
