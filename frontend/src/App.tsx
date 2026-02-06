/// <reference types="vite/client" />
import { useEffect, useState, useRef } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useGameStore, ObstructionType } from './store';
import { useSound } from './useSound';

// Render環境変数 VITE_WS_URL があればそれを使用、なければlocalhost
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

// WebSocketのオプションをコンポーネント外に定義して固定化
const STATIC_WS_OPTIONS = {
    onOpen: () => console.log('Connected to Server'),
    shouldReconnect: () => true,
};

// CPUモード用: 全画像プール
const ALL_CPU_IMAGES = [
    '/images/car1.jpg', '/images/car2.jpg', '/images/car3.jpg', '/images/car4.jpg', '/images/car5.jpg',
    '/images/shingouki1.jpg', '/images/shingouki2.jpg', '/images/shingouki3.jpg', '/images/shingouki4.jpg',
    '/images/kaidan0.jpg', '/images/kaidan1.jpg', '/images/kaidan2.jpg',
    '/images/shoukasen0.jpg', '/images/shoukasen1.jpg', '/images/shoukasen2.jpg',
    '/images/tamanegi5.png',
];

// タマネギ画像のパス
const ONION_IMAGE = '/images/tamanegi5.png';

// 待機時間を制御するヘルパー関数
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// タマネギ降下エフェクトコンポーネント
const OnionRain = () => {
    const onions = Array.from({ length: 100 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100, // %
        delay: Math.random() * 2, // 秒
        duration: 0.5 + Math.random() * 1.5, // 秒
        size: 30 + Math.random() * 100, // px
    }));

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-50 rounded-sm">
            {onions.map((o) => (
                <motion.img
                    key={o.id}
                    src={ONION_IMAGE}
                    initial={{ y: -150, opacity: 1, rotate: 0 }}
                    animate={{ y: 800, rotate: 720 }}
                    transition={{
                        duration: o.duration,
                        repeat: Infinity,
                        delay: o.delay,
                        ease: "linear"
                    }}
                    className="absolute object-contain opacity-100"
                    style={{
                        left: `${o.left}%`,
                        width: `${o.size}px`,
                        height: `${o.size}px`
                    }}
                />
            ))}
        </div>
    );
};

// ヘルパー: 新しいCPU問題を生成
// prevTarget: 前回のお題（これとは違うお題を選ぶ）
const generateCpuProblem = (prevTarget?: string) => {
    const targets = ['車', '信号機', '階段', '消火栓'];
    let newTarget = targets[Math.floor(Math.random() * targets.length)];

    // 前回と同じなら選び直し (無限ループ防止でtargetsが2つ以上ある場合のみ)
    if (prevTarget && targets.length > 1) {
        while (newTarget === prevTarget) {
            newTarget = targets[Math.floor(Math.random() * targets.length)];
        }
    }

    let searchKey = '';
    if (newTarget === '車') searchKey = 'car';
    else if (newTarget === '信号機') searchKey = 'shingouki';
    else if (newTarget === '階段') searchKey = 'kaidan';
    else if (newTarget === '消火栓') searchKey = 'shoukasen';

    const corrects = ALL_CPU_IMAGES.filter(img => img.toLowerCase().includes(searchKey));
    const others = ALL_CPU_IMAGES.filter(img => !img.toLowerCase().includes(searchKey));

    const shuffledCorrects = [...corrects].sort(() => Math.random() - 0.5);
    const shuffledOthers = [...others].sort(() => Math.random() - 0.5);

    const count = Math.min(3, shuffledCorrects.length);
    const selected = shuffledCorrects.slice(0, count);
    const remainingCandidates = [...shuffledOthers, ...shuffledCorrects.slice(count)].sort(() => Math.random() - 0.5);
    const finalImages = [...selected, ...remainingCandidates.slice(0, 9 - selected.length)];

    return {
        target: newTarget,
        images: finalImages.sort(() => Math.random() - 0.5)
    };
};

// ヘルパー: 正解インデックス計算
const getCorrectIndices = (imgs: string[], tgt: string) => {
    let searchKey = '';
    if (tgt === '車') searchKey = 'car';
    else if (tgt === '信号機') searchKey = 'shingouki';
    else if (tgt === '階段') searchKey = 'kaidan';
    else if (tgt === '消火栓') searchKey = 'shoukasen';
    else if (tgt === 'TRAFFIC LIGHT') searchKey = 'shingouki';
    else searchKey = tgt.toLowerCase();

    return imgs
        .map((img, idx) => img.toLowerCase().includes(searchKey) ? idx : -1)
        .filter(idx => idx !== -1);
};

// ヘルパー: ランダムなお邪魔エフェクト
const getRandomObstruction = (): ObstructionType => {
    const effects: ObstructionType[] = ['SHAKE', 'SPIN', 'BLUR', 'INVERT', 'ONION_RAIN', 'GRAYSCALE', 'SEPIA', 'SKEW'];
    return effects[Math.floor(Math.random() * effects.length)];
};

function App() {
    const {
        gameState, roomId, playerId, target, images,
        cpuImages, cpuDifficulty,
        opponentScore, opponentSelections, mySelections,
        setGameState, setRoomInfo, startGame,
        updateCpuPattern, updatePlayerPattern,
        updateOpponentScore, toggleOpponentSelection,
        resetOpponentSelections, toggleMySelection, resetMySelections, endGame, winner,
        feedback, setFeedback, setCpuDifficulty,
        // コンボとお邪魔関連
        playerCombo, opponentCombo, playerEffect, opponentEffect,
        setPlayerCombo, setPlayerEffect, setOpponentEffect
    } = useGameStore();

    const [inputRoom, setInputRoom] = useState('');
    const [loginError, setLoginError] = useState('');
    const [gameMode, setGameMode] = useState<'CPU' | 'ONLINE' | null>(null);
    const [loginStep, setLoginStep] = useState<'SELECT' | 'FRIEND' | 'FRIEND_INPUT' | 'WAITING' | 'DIFFICULTY'>('SELECT');
    const [myScore, setMyScore] = useState(0);
    const [isReloading, setIsReloading] = useState(false);

    // 連打防止のためのフラグ
    const [isVerifying, setIsVerifying] = useState(false);

    // 試合開始ポップアップの管理
    const [startPopup, setStartPopup] = useState(false);
    const [startMessage, setStartMessage] = useState('Start!');
    const [isCreator, setIsCreator] = useState(false);

    // キャンセル時にカウントダウンなどを止めるフラグ
    const isMatchingRef = useRef(false);

    // メッセージの重複処理防止用
    const prevMessageRef = useRef<MessageEvent<any> | null>(null);

    const { initAudio, playError, playSuccess, playWin, playLose, playObstruction, playStart } = useSound();

    const { sendMessage, lastMessage, readyState } = useWebSocket(WS_URL, STATIC_WS_OPTIONS);

    // お邪魔エフェクト
    useEffect(() => {
        if (playerEffect) {
            playObstruction();
            const timer = setTimeout(() => setPlayerEffect(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [playerEffect, setPlayerEffect]);

    useEffect(() => {
        if (opponentEffect) {
            const timer = setTimeout(() => setOpponentEffect(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [opponentEffect, setOpponentEffect]);


    // CPU対戦ロジック
    useEffect(() => {
        if (gameMode === 'CPU' && gameState === 'PLAYING') {
            let intervalTime = 800;
            let actionProb = 0.3;
            let submitProb = 0.5;

            if (cpuDifficulty === 1) { // よわい
                intervalTime = 1200;
                actionProb = 0.5;
                submitProb = 0.3;
            } else if (cpuDifficulty === 3) { // つよい
                intervalTime = 700;
                actionProb = 0.2;
                submitProb = 0.55;
            }

            const interval = setInterval(() => {
                const store = useGameStore.getState();

                if (store.opponentEffect) {
                    if (Math.random() > 0.5) return;
                }

                const currentSelections = store.opponentSelections;
                const correctIndices = getCorrectIndices(store.cpuImages, store.cpuTarget);
                const remaining = correctIndices.filter(i => !currentSelections.includes(i));

                if (remaining.length > 0) {
                    if (Math.random() > actionProb) {
                        const next = remaining[Math.floor(Math.random() * remaining.length)];
                        store.toggleOpponentSelection(next);
                    }
                } else {
                    if (Math.random() > (1 - submitProb)) {
                        store.updateOpponentScore(store.opponentScore + 1);
                        store.resetOpponentSelections();

                        const newCombo = store.opponentCombo + 1;
                        store.setOpponentCombo(newCombo);

                        if (newCombo >= 2) {
                            store.setOpponentCombo(0);
                            store.setPlayerEffect(getRandomObstruction());
                        }

                        // 修正: 次の問題を生成する際、現在のお題(cpuTarget)を渡して重複を防ぐ
                        const nextProb = generateCpuProblem(store.cpuTarget);
                        store.updateCpuPattern(nextProb.target, nextProb.images);
                    }
                }
            }, intervalTime);
            return () => clearInterval(interval);
        }
    }, [gameMode, gameState, cpuDifficulty]);

    // 勝利判定
    useEffect(() => {
        if (gameMode === 'CPU' && gameState === 'PLAYING') {
            if (opponentScore >= 5) {
                playLose();
                endGame('cpu');
            } else if (myScore >= 5) {
                playWin();
                endGame('human');
            }
        }
    }, [opponentScore, myScore, gameMode, gameState, endGame, playWin, playLose]);


    // メッセージハンドリング
    useEffect(() => {
        if (gameMode !== 'ONLINE') return;

        if (lastMessage !== null) {
            // 重複メッセージ防止
            if (lastMessage === prevMessageRef.current) return;
            prevMessageRef.current = lastMessage;

            try {
                const msg = JSON.parse(lastMessage.data);
                switch (msg.type) {
                    case 'ROOM_ASSIGNED':
                        setRoomInfo(msg.payload.room_id, playerId);
                        if (gameState === 'LOGIN') {
                            setGameState('WAITING');
                        }
                        break;
                    case 'STATUS_UPDATE':
                        setGameState('WAITING');
                        break;
                    case 'GAME_START':
                        if (isMatchingRef.current) return;
                        isMatchingRef.current = true;

                        startGame(msg.payload.target, msg.payload.images);
                        if (msg.payload.opponent_images) {
                            updateCpuPattern("", msg.payload.opponent_images);
                        }
                        setMyScore(0);
                        setIsVerifying(false);

                        (async () => {
                            setStartPopup(true);
                            setStartMessage("マッチングしました！");
                            playStart();

                            await sleep(1500);
                            if (!isMatchingRef.current) { setStartPopup(false); return; }

                            setStartMessage("3");
                            await sleep(1000);
                            if (!isMatchingRef.current) { setStartPopup(false); return; }

                            setStartMessage("2");
                            await sleep(1000);
                            if (!isMatchingRef.current) { setStartPopup(false); return; }

                            setStartMessage("1");
                            await sleep(1000);
                            if (!isMatchingRef.current) { setStartPopup(false); return; }

                            setStartMessage("START!");
                            await sleep(500);
                            if (!isMatchingRef.current) { setStartPopup(false); return; }

                            setTimeout(() => setStartPopup(false), 500);
                        })();
                        break;

                    case 'UPDATE_PATTERN':
                        setIsVerifying(false);
                        playSuccess();
                        updatePlayerPattern(msg.payload.target, msg.payload.images);
                        setFeedback('CORRECT');
                        setMyScore(prev => prev + 1);
                        setTimeout(() => setFeedback(null), 1000);
                        break;

                    case 'OPPONENT_UPDATE':
                        updateCpuPattern("", msg.payload.images);
                        updateOpponentScore(msg.payload.score);
                        resetOpponentSelections();
                        break;

                    case 'OBSTRUCTION':
                        setPlayerEffect(msg.payload.effect as ObstructionType);
                        break;

                    case 'OPPONENT_SELECT':
                        if (msg.payload.player_id !== playerId) {
                            toggleOpponentSelection(msg.payload.image_index);
                        }
                        break;
                    case 'GAME_FINISHED':
                        setIsVerifying(false);
                        if (msg.payload.winner_id === playerId) {
                            playWin();
                        } else {
                            playLose();
                        }
                        endGame(msg.payload.winner_id);
                        break;
                    case 'VERIFY_FAILED':
                        setIsVerifying(false);
                        if (feedback !== 'WRONG') {
                            playError();
                            setFeedback('WRONG');
                            setTimeout(() => setFeedback(null), 1000);
                            resetMySelections();
                        }
                        break;
                }
            } catch (e) {
                console.error("Failed to parse message:", e);
            }
        }
    }, [lastMessage, setGameState, startGame, updateCpuPattern, updatePlayerPattern, updateOpponentScore, toggleOpponentSelection, resetOpponentSelections, resetMySelections, endGame, playerId, gameMode, setRoomInfo, setFeedback, setPlayerEffect, playError, playSuccess, playWin, playLose, playStart, feedback]);

    const startCpuFlow = () => {
        initAudio();
        setLoginStep('DIFFICULTY');
    };

    const confirmDifficulty = (level: number) => {
        playStart();
        setCpuDifficulty(level);
        setGameMode('CPU');
        setRoomInfo('LOCAL_CPU', playerId);
        setMyScore(0);
        const myProb = generateCpuProblem();
        const cpuProb = generateCpuProblem();
        startGame(myProb.target, myProb.images);
        updateCpuPattern(cpuProb.target, cpuProb.images);
    };

    const joinRandom = () => {
        initAudio();
        setGameMode('ONLINE');
        sendMessage(JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { room_id: "RANDOM", player_id: playerId }
        }));
    };

    const joinFriend = () => {
        initAudio();
        setLoginStep('FRIEND');
    };

    const createRoom = () => {
        playStart();
        setIsCreator(true);
        setLoginError('');
        setLoginStep('FRIEND_INPUT');
    };

    const enterRoomFlow = () => {
        playStart();
        setIsCreator(false);
        setLoginError('');
        setLoginStep('FRIEND_INPUT');
    };

    const joinRoomInternal = (room: string) => {
        if (!room) {
            setLoginError("IDを入力してね");
            return;
        }
        setGameMode('ONLINE');
        setRoomInfo(room, playerId);
        sendMessage(JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { room_id: room, player_id: playerId }
        }));
    };

    const handleImageClick = (index: number) => {
        if (isReloading || isVerifying) return;
        toggleMySelection(index);
        if (gameMode === 'ONLINE') {
            sendMessage(JSON.stringify({
                type: 'SELECT_IMAGE',
                payload: { room_id: roomId, player_id: playerId, image_index: index }
            }));
        }
    };

    const handleReload = () => {
        if (isReloading || isVerifying) return;
        setIsReloading(true);
        resetMySelections();
        setTimeout(() => {
            if (gameMode === 'CPU') {
                // 修正: 現在のお題(target)を渡して重複を防ぐ
                const nextProb = generateCpuProblem(target);
                updatePlayerPattern(nextProb.target, nextProb.images);
            }
            setIsReloading(false);
        }, 1000);
    };

    const handleVerify = () => {
        if (isReloading || isVerifying) return;

        if (gameMode === 'CPU') {
            const correctIndices = getCorrectIndices(images, target);
            const isCorrect = mySelections.length === correctIndices.length && mySelections.every(idx => correctIndices.includes(idx));

            if (isCorrect) {
                if (myScore + 1 < 5) {
                    playSuccess();
                    setFeedback('CORRECT');
                    setTimeout(() => setFeedback(null), 1000);
                }

                setMyScore(prev => prev + 1);
                resetMySelections();

                const newCombo = playerCombo + 1;
                setPlayerCombo(newCombo);
                if (newCombo >= 2) {
                    setPlayerCombo(0);
                    setOpponentEffect(getRandomObstruction());
                }

                // 修正: 現在のお題(target)を渡して重複を防ぐ
                const nextProb = generateCpuProblem(target);
                updatePlayerPattern(nextProb.target, nextProb.images);
            } else {
                playError();
                setFeedback('WRONG');
                setTimeout(() => setFeedback(null), 1000);
                setPlayerCombo(0);
                resetMySelections();
            }
        } else {
            setIsVerifying(true);
            sendMessage(JSON.stringify({
                type: 'VERIFY',
                payload: { room_id: roomId, player_id: playerId, selected_indices: mySelections }
            }));

            setTimeout(() => {
                setIsVerifying(prev => {
                    if (prev) return false;
                    return prev;
                });
            }, 5000);
        }
    };

    const cancelWaiting = () => {
        isMatchingRef.current = false;
        setStartPopup(false);
        setIsVerifying(false);

        if (gameMode === 'ONLINE' || (roomId && roomId !== 'LOCAL_CPU')) {
            sendMessage(JSON.stringify({
                type: 'LEAVE_ROOM',
                payload: { room_id: roomId, player_id: playerId }
            }));
        }
        setGameState('LOGIN');
        setLoginStep(prev => prev === 'SELECT' ? 'SELECT' : 'FRIEND');
        setGameMode(null);
        setInputRoom('');
        setLoginError('');
        setMyScore(0);
    };

    const goHome = () => {
        isMatchingRef.current = false;
        setStartPopup(false);
        setIsVerifying(false);

        if (gameMode === 'ONLINE' || (roomId && roomId !== 'LOCAL_CPU')) {
            sendMessage(JSON.stringify({
                type: 'LEAVE_ROOM',
                payload: { room_id: roomId, player_id: playerId }
            }));
        }
        setGameState('LOGIN');
        setLoginStep('SELECT');
        setGameMode(null);
        setInputRoom('');
        setLoginError('');
        setMyScore(0);
    };

    // 再接続時のバグ防止
    useEffect(() => {
        if (readyState === ReadyState.OPEN) {
            const store = useGameStore.getState();
            if ((store.gameState === 'PLAYING' || store.gameState === 'WAITING') && store.roomId !== 'LOCAL_CPU') {
                goHome();
            }
        }
    }, [readyState]);

    const rivalImages = gameMode === 'CPU' ? cpuImages : cpuImages;

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

    return (
        <div className="h-screen w-screen bg-white flex flex-col items-center font-sans text-gray-800 overflow-hidden relative">

            <AnimatePresence>
                {playerEffect && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        className="fixed top-24 left-0 right-0 z-[60] flex justify-center pointer-events-none"
                    >
                        <div className="bg-red-500 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-red-200">
                            ⚠️ 妨害: {playerEffect}
                        </div>
                    </motion.div>
                )}
                {opponentEffect && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        className="fixed top-36 left-0 right-0 z-[60] flex justify-center pointer-events-none"
                    >
                        <div className="bg-blue-500 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-blue-200">
                            ⚔️ 攻撃中: {opponentEffect}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {startPopup && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.5 }}
                        className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/40 pointer-events-auto"
                    >
                        <div className="bg-white p-12 rounded-3xl shadow-2xl flex flex-col items-center border-4 border-[#5B46F5] pointer-events-auto">
                            <h2 className={`${startMessage.length > 8 ? 'text-4xl' : 'text-6xl'} font-black text-[#5B46F5] tracking-widest uppercase`}>
                                {startMessage}
                            </h2>
                            <p className="text-xl font-bold text-gray-600 mt-2">
                                {startMessage === 'START!' ? 'Go!' : '準備完了'}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {feedback && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none"
                    >
                        {feedback === 'CORRECT' ? (
                            <div className="bg-white/90 p-12 rounded-full shadow-2xl backdrop-blur-sm">
                                <svg className="w-40 h-40 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            </div>
                        ) : (
                            <div className="bg-white/90 p-12 rounded-full shadow-2xl backdrop-blur-sm">
                                <svg className="w-40 h-40 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {(gameState !== 'LOGIN' || loginStep !== 'SELECT') && (
                <button
                    onClick={goHome}
                    className="absolute top-2 left-2 z-[100] flex items-center gap-1 px-3 py-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition bg-white/80 backdrop-blur-sm shadow-sm cursor-pointer pointer-events-auto"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span className="hidden md:inline font-bold">ホーム</span>
                </button>
            )}

            <div className="w-full h-full max-w-7xl flex flex-col relative">
                <div className="flex flex-col items-center mt-2 mb-1 shrink-0 z-40 pointer-events-none">
                    <h1 className="text-2xl md:text-4xl font-bold flex items-center gap-2 pointer-events-auto">
                        <span className="text-[#4A90E2]">reCAPTCHA</span>
                        <span className="text-[#BFA15F]">ゲーム</span>
                    </h1>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto w-full">

                    {gameState === 'LOGIN' && (
                        <div className="animate-fade-in w-full max-w-4xl mx-auto h-full flex flex-col p-4">
                            {loginStep === 'SELECT' && (
                                <div className="flex flex-col items-center justify-center gap-8 h-full py-4">
                                    <div className="flex-1 w-full max-w-md space-y-6">
                                        <div className="text-center space-y-2">
                                            <p className="text-lg text-gray-600 font-medium">くそうざいreCAPTCHAを面白くしよう！</p>
                                            <h2 className="text-3xl font-bold text-[#5B46F5] leading-tight">
                                                60秒以内に何回人間か<br />証明できる？
                                            </h2>
                                        </div>

                                        <div className="bg-[#F9F9F7] p-6 rounded-3xl text-left space-y-4 shadow-sm border border-gray-100">
                                            <h3 className="text-center font-bold text-gray-800 text-lg mb-2">ルール：</h3>
                                            <ul className="space-y-3 text-base text-gray-700 font-medium">
                                                <li className="flex items-start gap-3">
                                                    <span className="text-[#5B46F5] font-bold text-xl">✓</span>
                                                    画像の該当部分をすべて選択
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <span className="text-[#5B46F5] font-bold text-xl">✓</span>
                                                    「確認」ボタンを押して正解なら1点
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <span className="text-[#5B46F5] font-bold text-xl">✓</span>
                                                    2連続正解で相手を妨害！
                                                </li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="flex-1 w-full max-w-md space-y-4 pb-10">
                                        <p className="text-center text-gray-400 font-bold mb-2">対戦モードを選択</p>
                                        <button onClick={startCpuFlow} className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:shadow-lg transition-all duration-300">
                                            <div className="flex items-center gap-4">
                                                <span className="text-3xl bg-indigo-50 p-3 rounded-xl group-hover:scale-110 transition">🤖</span>
                                                <div className="text-left">
                                                    <p className="text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition">CPUと対戦</p>
                                                    <p className="text-sm text-gray-400 font-medium">一人で練習</p>
                                                </div>
                                            </div>
                                            <svg className="w-6 h-6 text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </button>
                                        <button onClick={joinRandom} className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-pink-100 hover:border-pink-500 hover:shadow-lg transition-all duration-300">
                                            <div className="flex items-center gap-4">
                                                <span className="text-3xl bg-pink-50 p-3 rounded-xl group-hover:scale-110 transition">🌍</span>
                                                <div className="text-left">
                                                    <p className="text-xl font-bold text-gray-800 group-hover:text-pink-600 transition">誰かと対戦</p>
                                                    <p className="text-sm text-gray-400 font-medium">ランダムマッチ</p>
                                                </div>
                                            </div>
                                            <svg className="w-6 h-6 text-gray-300 group-hover:text-pink-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </button>
                                        <button onClick={joinFriend} className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-teal-100 hover:border-teal-500 hover:shadow-lg transition-all duration-300">
                                            <div className="flex items-center gap-4">
                                                <span className="text-3xl bg-teal-50 p-3 rounded-xl group-hover:scale-110 transition">🤝</span>
                                                <div className="text-left">
                                                    <p className="text-xl font-bold text-gray-800 group-hover:text-teal-600 transition">友達と対戦</p>
                                                    <p className="text-sm text-gray-400 font-medium">部屋を作る・入る</p>
                                                </div>
                                            </div>
                                            <svg className="w-6 h-6 text-gray-300 group-hover:text-teal-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {loginStep === 'FRIEND' && (
                                <div className="flex flex-col items-center justify-center gap-8 h-full py-4">
                                    <div className="text-center space-y-2">
                                        <h2 className="text-3xl font-black text-gray-800">友達と対戦</h2>
                                        <p className="text-gray-500 font-medium">どうやって対戦する？</p>
                                    </div>

                                    <div className="w-full max-w-md space-y-4">
                                        <button
                                            onClick={createRoom}
                                            className="w-full group bg-white border-2 border-indigo-200 hover:border-indigo-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-4 rounded-2xl flex items-center gap-4"
                                        >
                                            <div className="bg-indigo-100 text-indigo-600 font-black text-2xl w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">🏠</div>
                                            <div className="text-left">
                                                <p className="text-xl font-bold text-indigo-600">部屋を作成</p>
                                                <p className="text-sm text-gray-400">新しい部屋を作って待機</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={enterRoomFlow}
                                            className="w-full group bg-white border-2 border-purple-200 hover:border-purple-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-4 rounded-2xl flex items-center gap-4"
                                        >
                                            <div className="bg-purple-100 text-purple-600 font-black text-2xl w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">🚪</div>
                                            <div className="text-left">
                                                <p className="text-xl font-bold text-purple-600">部屋に入室</p>
                                                <p className="text-sm text-gray-400">IDを入力して参加</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {loginStep === 'FRIEND_INPUT' && (
                                <div className="space-y-10 text-center flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
                                    <div className="space-y-2">
                                        <h2 className="text-xl font-bold text-gray-700">{isCreator ? "ルームIDを決める" : "ルームIDを入力"}</h2>
                                        <p className="text-sm text-gray-400">{isCreator ? "好きなIDを入力してね" : "友達から教えてもらったIDを入力してね"}</p>
                                    </div>
                                    <div className="relative">
                                        {/* 修正箇所: エラーメッセージを絶対配置にしてレイアウトシフトを防止 */}
                                        {loginError && <p className="absolute -top-7 left-0 w-full text-red-500 font-bold text-sm">{loginError}</p>}
                                        <input
                                            type="text"
                                            value={inputRoom}
                                            onChange={(e) => {
                                                setInputRoom(e.target.value);
                                                if (loginError) setLoginError('');
                                            }}
                                            placeholder="1234"
                                            className="w-full text-3xl font-bold text-center py-4 rounded-xl border-2 border-gray-200 bg-white focus:border-[#5B46F5] focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all tracking-widest placeholder-gray-200 shadow-sm"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        onClick={() => joinRoomInternal(inputRoom)}
                                        className="w-full bg-[#5B46F5] text-white text-lg font-bold py-4 rounded-xl hover:bg-indigo-700 hover:-translate-y-0.5 hover:shadow-lg transition-all active:scale-95 active:shadow-none"
                                    >
                                        {isCreator ? "部屋を作る" : "入室する"}
                                    </button>
                                </div>
                            )}

                            {loginStep === 'DIFFICULTY' && (
                                <div className="flex flex-col items-center justify-center gap-8 h-full py-4">
                                    <div className="text-center space-y-2">
                                        <span className="bg-orange-100 text-orange-600 p-4 rounded-2xl text-4xl inline-block mb-2">⚡</span>
                                        <h2 className="text-3xl font-black text-gray-800">難易度を選択</h2>
                                        <p className="text-gray-500 font-medium">チャレンジの難しさを選んでね</p>
                                    </div>

                                    <div className="w-full max-w-md space-y-4">
                                        <button
                                            onClick={() => confirmDifficulty(1)}
                                            className="w-full group bg-white border-2 border-green-200 hover:border-green-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-4 rounded-2xl flex items-center gap-4"
                                        >
                                            <div className="bg-green-100 text-green-600 font-black text-2xl w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">1</div>
                                            <div className="text-left">
                                                <p className="text-xl font-bold text-green-600">よわい</p>
                                                <p className="text-sm text-gray-400">のんびりプレイ向け</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => confirmDifficulty(2)}
                                            className="w-full group bg-white border-2 border-orange-200 hover:border-orange-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-4 rounded-2xl flex items-center gap-4"
                                        >
                                            <div className="bg-orange-100 text-orange-600 font-black text-2xl w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">2</div>
                                            <div className="text-left">
                                                <p className="text-xl font-bold text-orange-600">ふつう</p>
                                                <p className="text-sm text-gray-400">バランスの取れた難易度</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => confirmDifficulty(3)}
                                            className="w-full group bg-white border-2 border-red-200 hover:border-red-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-4 rounded-2xl flex items-center gap-4"
                                        >
                                            <div className="bg-red-100 text-red-600 font-black text-2xl w-12 h-12 flex items-center justify-center rounded-full shrink-0 group-hover:scale-110 transition">3</div>
                                            <div className="text-left">
                                                <p className="text-xl font-bold text-red-600">つよい</p>
                                                <p className="text-sm text-gray-400">本気で挑戦したい人向け</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {gameState === 'WAITING' && (
                        <div className="text-center h-full flex flex-col items-center justify-center space-y-10">
                            <div className="animate-spin h-20 w-20 border-8 border-[#5B46F5] border-t-transparent rounded-full"></div>
                            <div>
                                <p className="text-3xl font-bold text-gray-700">対戦相手を待機中...</p>
                                <p className="text-lg text-gray-400 mt-2">Room: {roomId}</p>
                            </div>
                            <button
                                onClick={cancelWaiting}
                                className="inline-block px-8 py-3 text-gray-500 font-bold hover:text-white hover:bg-gray-400 rounded-full border-2 border-gray-300 transition cursor-pointer z-50 pointer-events-auto"
                            >
                                キャンセル
                            </button>
                        </div>
                    )}

                    {gameState === 'PLAYING' && (
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
                                                    <div className={`w-full h-full transition-transform duration-100 ${mySelections.includes(idx) ? 'scale-75' : 'scale-100 group-hover:opacity-90'}`}>
                                                        <img
                                                            src={img}
                                                            alt="captcha"
                                                            className="w-full h-full object-cover aspect-square block"
                                                        />
                                                    </div>

                                                    {mySelections.includes(idx) && (
                                                        <div className="absolute top-0 left-0 text-white bg-[#4285F4] rounded-full p-1 m-1 shadow-md z-10">
                                                            <svg className="w-4 h-4 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
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
                                        You: {myScore}/5
                                    </div>
                                    <div className="flex-1 mx-4 md:mx-6 h-4 bg-gray-200 rounded-full overflow-hidden relative shadow-inner">
                                        <div
                                            className="absolute top-0 left-0 h-full bg-[#5B46F5] transition-all duration-500 ease-out"
                                            style={{ width: `${(myScore / 5) * 100}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {gameMode === 'CPU' ? (cpuDifficulty === 3 ? 'CPU (つよい)' : (cpuDifficulty === 1 ? 'CPU (よわい)' : 'CPU (ふつう)')) : 'Rival'}: {opponentScore}/5
                                        <span className="w-4 h-4 rounded-full bg-red-500 shadow-sm"></span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                    {gameState === 'RESULT' && (
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
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;