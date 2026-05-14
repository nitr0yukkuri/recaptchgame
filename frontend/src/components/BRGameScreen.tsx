import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useGameStore } from '../store';
import { OnionRain } from './OnionRain';
import { parseSplitTileIndex } from '../utils/game';

type BRGameScreenProps = {
    myScore: number;
    winningScore: number;
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

const renderCaptchaImage = (img: string, tileIndex: number, className: string) => {
    const splitTileIndex = parseSplitTileIndex(img);

    if (splitTileIndex === null) {
        return <img src={img} alt="captcha" className={className} />;
    }

    return (
        <div className="relative w-full h-full overflow-hidden">
            <img
                src={img}
                alt="captcha"
                className={className}
                style={getSplitTileStyle(tileIndex)}
            />
        </div>
    );
};

export const BRGameScreen = ({
    myScore, winningScore,
    isReloading, isVerifying,
    handleImageClick, handleReload, handleVerify
}: BRGameScreenProps) => {
    const {
        target, images, playerCombo, playerEffect, mySelections,
        brOpponents, cpuImages
    } = useGameStore();

    const opponents = brOpponents;

    const oppLeft = opponents[0];
    const oppRight = opponents[1];
    const oppBottom = opponents[2]; // may be undefined for 3-player matches

    const renderOpponent = (opp: any, title: string) => (
        <div className="flex flex-col justify-center items-center shrink-0 w-full md:w-auto">
            <h3 className="text-sm md:text-lg font-bold text-gray-700 mb-1">{title} {opp.combo > 0 && <span className="text-orange-500">Combo: {opp.combo}</span>}</h3>

            <motion.div
                variants={obstructionVariants}
                animate={['SHAKE', 'SPIN', 'SKEW'].includes(opp.effect || '') ? (opp.effect as string) : 'NORMAL'}
                className={`relative overflow-hidden bg-gray-100 rounded-sm p-1.5 flex flex-col items-center shadow-inner w-[120px] md:w-40 border border-gray-300 
                    ${opp.effect === 'BLUR' ? 'blur-[4px]' : ''} 
                    ${opp.effect === 'INVERT' ? 'invert' : ''}
                    ${opp.effect === 'GRAYSCALE' ? 'grayscale' : ''}
                    ${opp.effect === 'SEPIA' ? 'sepia' : ''}
                `}
            >
                {opp.effect === 'ONION_RAIN' && <OnionRain />}

                <div className="flex items-center gap-1.5 mb-1.5 w-full justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                    <p className="text-[10px] font-bold text-gray-500">RIVAL VIEW</p>
                </div>
                <div className="grid grid-cols-3 gap-[1px] w-full opacity-90">
                    {(opp.images || cpuImages).map((img: string, idx: number) => (
                        <div key={`opp-${idx}`} className="relative aspect-square overflow-hidden bg-gray-300">
                            <div className={`w-full h-full origin-center transition-transform duration-150 ease-out ${opp.selections.includes(idx) ? 'scale-90' : 'scale-100'}`}>
                                {renderCaptchaImage(img, idx, 'w-full h-full object-contain sm:object-cover aspect-square block')}
                            </div>
                            {opp.selections.includes(idx) && (
                                <div className="absolute top-0 left-0 bg-[#4285F4] rounded-full p-[1px] m-[1px] z-10">
                                    <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );

    return (
        <div className="flex flex-col h-full justify-start pt-8 pb-20 overflow-x-hidden overflow-y-auto min-h-0">
            <div className="bg-[#5B46F5] text-white px-5 py-3 rounded-2xl mb-4 shadow-md shrink-0 text-left flex flex-col justify-center mx-4 md:mx-auto w-auto md:w-full max-w-2xl z-20">
                <p className="text-xs opacity-90 font-medium mb-0.5">以下の画像をすべて選択：</p>
                <h2 className="text-xl md:text-2xl font-bold uppercase tracking-wider leading-none">{target}</h2>
            </div>

            {/* クロス（十字）型レイアウト */}
            <div className="flex flex-col items-center justify-center w-full max-w-5xl mx-auto px-2 md:px-4">

                {/* 上段（左の相手・自分・右の相手） */}
                <div className="flex flex-row items-center justify-center gap-2 md:gap-12 w-full">
                    {/* 左側の相手 (存在する場合のみ表示) */}
                    {oppLeft && (
                        <div className="hidden md:block mt-8">
                            {renderOpponent(oppLeft, "ライバル 1")}
                        </div>
                    )}

                    {/* 自分の画面（中央・特大） */}
                    <div className="flex flex-col items-center w-full max-w-[320px] md:max-w-[380px] shrink-0 z-10">
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
                                        <div className={`w-full h-full origin-center transition-transform duration-150 ease-out ${mySelections.includes(idx) ? 'scale-90' : 'scale-100 group-hover:opacity-90'}`}>
                                            {renderCaptchaImage(img, idx, 'w-full h-full object-cover aspect-square block')}
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

                    {/* 右側の相手 (存在する場合のみ表示) */}
                    {oppRight && (
                        <div className="mt-8">
                            {renderOpponent(oppRight, "ライバル 2")}
                        </div>
                    )}
                </div>

                {/* 下段（モバイルの場合は左の相手もここに並べる） */}
                <div className="flex flex-row items-center justify-center gap-6 mt-4 md:mt-8 w-full">
                    {/* モバイルでは左を下段に回す（存在する場合） */}
                    {oppLeft && (
                        <div className="block md:hidden">
                            {renderOpponent(oppLeft, "ライバル 1")}
                        </div>
                    )}

                    {/* 下段は oppBottom が存在する場合のみ表示（3人未満なら表示しない） */}
                    {oppBottom && (
                        <div>
                            {renderOpponent(oppBottom, "ライバル 3")}
                        </div>
                    )}
                </div>

            </div>

            <div className="w-full max-w-3xl mx-auto px-4 mt-6">
                <div className="flex justify-between items-center text-sm md:text-xl font-bold text-gray-600 bg-white/80 p-3 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-green-500 shadow-sm"></span>
                        You: {myScore}/{winningScore}
                    </div>
                    <div className="flex-1 mx-2 md:mx-6 h-3 md:h-4 bg-gray-200 rounded-full overflow-hidden relative shadow-inner">
                        <div
                            className="absolute top-0 left-0 h-full bg-[#5B46F5] transition-all duration-500 ease-out"
                            style={{ width: `${(myScore / winningScore) * 100}%` }}
                        ></div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* 安全にトップスコアを計算（oppBottom が undefined の場合に備える） */}
                        {(() => {
                            const top = opponents.length ? Math.max(...opponents.map(o => o.score)) : 0;
                            return <>Top Rival: {top}/{winningScore}</>;
                        })()}
                        <span className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-red-500 shadow-sm"></span>
                    </div>
                </div>
            </div>
        </div>
    );
};
