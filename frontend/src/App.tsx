/// <reference types="vite/client" />
import React, { useEffect, useState } from 'react';
import useWebSocket from 'react-use-websocket';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useGameStore, ObstructionType } from './store';

// Render環境変数 VITE_WS_URL があればそれを使用、なければlocalhost
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

// CPUモード用: 全画像プール（追加分を含む）
const ALL_CPU_IMAGES = [
    '/images/car1.jpg', '/images/car2.jpg', '/images/car3.jpg', '/images/car4.jpg', '/images/car5.jpg',
    '/images/shingouki1.jpg', '/images/shingouki2.jpg', '/images/shingouki3.jpg', '/images/shingouki4.jpg',
    '/images/kaidan0.jpg', '/images/kaidan1.jpg', '/images/kaidan2.jpg', // 追加
    '/images/shoukasen0.jpg', '/images/shoukasen1.jpg', '/images/shoukasen2.jpg', // 追加
    '/images/tamanegi5.png',
];

// ヘルパー: 新しいCPU問題を生成（ランダム）
const generateCpuProblem = () => {
    const shuffledImages = [...ALL_CPU_IMAGES].sort(() => Math.random() - 0.5).slice(0, 9);
    // ターゲットにお題を追加
    const targets = ['車', '信号機', '階段', '消火栓'];
    const newTarget = targets[Math.floor(Math.random() * targets.length)];
    return { target: newTarget, images: shuffledImages };
};

// ヘルパー: 正解インデックスを動的に計算
const getCorrectIndices = (imgs: string[], tgt: string) => {
    let searchKey = '';
    // お題に対応するファイル名の一部をマッピング
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

// ヘルパー: ランダムなお邪魔エフェクトを選択
const getRandomObstruction = (): ObstructionType => {
    const effects: ObstructionType[] = ['SHAKE', 'SPIN', 'BLUR', 'INVERT'];
    return effects[Math.floor(Math.random() * effects.length)];
};

function App() {
    const {
        gameState, roomId, playerId, target, images,
        cpuTarget, cpuImages,
        opponentScore, opponentSelections, mySelections,
        setGameState, setRoomInfo, startGame, updatePattern,
        updateCpuPattern, updatePlayerPattern,
        updateOpponentScore, toggleOpponentSelection,
        resetOpponentSelections, toggleMySelection, resetMySelections, endGame, winner,
        feedback, setFeedback,
        // コンボとお邪魔関連
        playerCombo, opponentCombo, playerEffect, opponentEffect,
        setPlayerCombo, setOpponentCombo, setPlayerEffect, setOpponentEffect
    } = useGameStore();

    const [inputRoom, setInputRoom] = useState('');
    const [gameMode, setGameMode] = useState<'CPU' | 'ONLINE' | null>(null);
    const [loginStep, setLoginStep] = useState<'SELECT' | 'FRIEND' | 'WAITING'>('SELECT');
    const [myScore, setMyScore] = useState(0);

    const { sendMessage, lastMessage } = useWebSocket(WS_URL, {
        onOpen: () => console.log('Connected to Server'),
        shouldReconnect: () => true,
    });

    // お邪魔エフェクトの自動解除タイマー
    useEffect(() => {
        if (playerEffect) {
            const timer = setTimeout(() => setPlayerEffect(null), 3000); // 3秒で解除
            return () => clearTimeout(timer);
        }
    }, [playerEffect, setPlayerEffect]);

    useEffect(() => {
        if (opponentEffect) {
            const timer = setTimeout(() => setOpponentEffect(null), 3000); // 3秒で解除
            return () => clearTimeout(timer);
        }
    }, [opponentEffect, setOpponentEffect]);


    // CPU対戦ロジック（行動シミュレーション）
    useEffect(() => {
        if (gameMode === 'CPU' && gameState === 'PLAYING') {
            const interval = setInterval(() => {
                const store = useGameStore.getState();

                // 妨害を受けている場合、50%の確率でCPUが行動不能（フリーズ）になる
                if (store.opponentEffect) {
                    if (Math.random() > 0.5) return;
                }

                const currentSelections = store.opponentSelections;
                const correctIndices = getCorrectIndices(store.cpuImages, store.cpuTarget);
                const remaining = correctIndices.filter(i => !currentSelections.includes(i));

                if (remaining.length > 0) {
                    if (Math.random() > 0.3) {
                        const next = remaining[Math.floor(Math.random() * remaining.length)];
                        store.toggleOpponentSelection(next);
                    }
                } else {
                    if (Math.random() > 0.5) {
                        store.updateOpponentScore(store.opponentScore + 1);
                        store.resetOpponentSelections();

                        // コンボ計算
                        const newCombo = store.opponentCombo + 1;
                        store.setOpponentCombo(newCombo);

                        // 2連続正解でプレイヤーにお邪魔攻撃
                        if (newCombo >= 2) {
                            store.setOpponentCombo(0);
                            store.setPlayerEffect(getRandomObstruction());
                        }

                        const nextProb = generateCpuProblem();
                        store.updateCpuPattern(nextProb.target, nextProb.images);
                    }
                }
            }, 800);
            return () => clearInterval(interval);
        }
    }, [gameMode, gameState]);

    // 勝利判定
    useEffect(() => {
        if (gameMode === 'CPU' && gameState === 'PLAYING') {
            if (opponentScore >= 5) {
                endGame('cpu');
            } else if (myScore >= 5) {
                endGame('human');
            }
        }
    }, [opponentScore, myScore, gameMode, gameState, endGame]);


    // オンライン対戦用メッセージハンドリング
    useEffect(() => {
        if (gameMode === 'CPU') return;

        if (lastMessage !== null) {
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
                        startGame(msg.payload.target, msg.payload.images);
                        if (msg.payload.opponent_images) {
                            updateCpuPattern("", msg.payload.opponent_images);
                        }
                        setMyScore(0);
                        break;

                    case 'UPDATE_PATTERN':
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
                        endGame(msg.payload.winner_id);
                        break;
                    case 'VERIFY_FAILED':
                        setFeedback('WRONG');
                        setTimeout(() => setFeedback(null), 1000);
                        break;
                }
            } catch (e) {
                console.error("Failed to parse message:", e);
            }
        }
    }, [lastMessage, setGameState, startGame, updateCpuPattern, updatePlayerPattern, updateOpponentScore, toggleOpponentSelection, resetOpponentSelections, resetMySelections, endGame, playerId, gameMode, setRoomInfo, setFeedback, setPlayerEffect]);

    const startCpuGame = () => {
        setGameMode('CPU');
        setRoomInfo('LOCAL_CPU', playerId);
        setMyScore(0);
        const myProb = generateCpuProblem();
        const cpuProb = generateCpuProblem();
        startGame(myProb.target, myProb.images);
        updateCpuPattern(cpuProb.target, cpuProb.images);
    };

    const joinRandom = () => {
        setGameMode('ONLINE');
        sendMessage(JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { room_id: "RANDOM", player_id: playerId }
        }));
    };

    const joinFriend = () => {
        setLoginStep('FRIEND');
        setGameMode('ONLINE');
    };

    const joinRoomInternal = (room: string) => {
        if (!room) return;
        setRoomInfo(room, playerId);
        sendMessage(JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { room_id: room, player_id: playerId }
        }));
    };

    const handleImageClick = (index: number) => {
        toggleMySelection(index);
        if (gameMode === 'ONLINE') {
            sendMessage(JSON.stringify({
                type: 'SELECT_IMAGE',
                payload: { room_id: roomId, player_id: playerId, image_index: index }
            }));
        }
    };

    const handleVerify = () => {
        if (gameMode === 'CPU') {
            const correctIndices = getCorrectIndices(images, target);

            const isCorrect =
                mySelections.length === correctIndices.length &&
                mySelections.every(idx => correctIndices.includes(idx));

            if (isCorrect) {
                setMyScore(prev => prev + 1);
                resetMySelections();
                setFeedback('CORRECT');
                setTimeout(() => setFeedback(null), 1000);

                const newCombo = playerCombo + 1;
                setPlayerCombo(newCombo);
                if (newCombo >= 2) {
                    setPlayerCombo(0);
                    setOpponentEffect(getRandomObstruction());
                }

                const nextProb = generateCpuProblem();
                updatePlayerPattern(nextProb.target, nextProb.images);
            } else {
                setFeedback('WRONG');
                setTimeout(() => setFeedback(null), 1000);
                setPlayerCombo(0);
            }
        } else {
            sendMessage(JSON.stringify({
                type: 'VERIFY',
                payload: { room_id: roomId, player_id: playerId, selected_indices: mySelections }
            }));
        }
    };

    const cancelWaiting = () => {
        setGameState('LOGIN');
        setLoginStep('SELECT');
    };

    const goHome = () => {
        setGameState('LOGIN');
        setLoginStep('SELECT');
        setGameMode(null);
        setInputRoom('');
        setMyScore(0);
    };

    const rivalImages = gameMode === 'CPU' ? cpuImages : cpuImages;

    // Framer Motion アニメーション定義
    const obstructionVariants: Variants = {
        SHAKE: { x: [-15, 15, -15, 15, 0], transition: { repeat: Infinity, duration: 0.2 } },
        SPIN: { rotate: 360, transition: { repeat: Infinity, duration: 1, ease: "linear" } },
        BLUR: {},
        INVERT: {},
        NORMAL: { x: 0, rotate: 0 }
    };

    return (
        <div className="h-screen w-screen bg-white flex flex-col items-center p-2 font-sans text-gray-800 overflow-hidden relative">

            <div className="w-full h-full max-w-7xl flex flex-col relative">

                <AnimatePresence>
                    {feedback && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
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

                {/* お邪魔発生時の通知ポップアップ */}
                <AnimatePresence>
                    {playerEffect && (
                        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="absolute top-16 z-40 bg-red-500 text-white px-6 py-2 rounded-full font-bold shadow-lg">
                            ⚠️ 妨害を受けています！ ({playerEffect})
                        </motion.div>
                    )}
                    {opponentEffect && (
                        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="absolute top-16 right-0 z-40 bg-blue-500 text-white px-6 py-2 rounded-full font-bold shadow-lg">
                            ⚔️ 妨害攻撃中！ ({opponentEffect})
                        </motion.div>
                    )}
                </AnimatePresence>

                {(gameState !== 'LOGIN' || loginStep !== 'SELECT') && (
                    <button
                        onClick={goHome}
                        className="absolute top-0 left-0 flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition z-20 font-bold"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span>ホームに戻る</span>
                    </button>
                )}

                <div className="flex flex-col items-center mb-2 shrink-0">
                    <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2 mb-1">
                        <span className="text-[#4A90E2]">reCAPTCHA</span>
                        <span className="text-[#BFA15F]">ゲーム</span>
                    </h1>
                </div>

                <div className="flex-1 flex flex-col w-full min-h-0 overflow-y-auto">

                    {gameState === 'LOGIN' && (
                        <div className="animate-fade-in w-full max-w-4xl mx-auto h-full flex flex-col">
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

                                    <div className="flex-1 w-full max-w-md space-y-4">
                                        <p className="text-center text-gray-400 font-bold mb-2">対戦モードを選択</p>
                                        <button
                                            onClick={startCpuGame}
                                            className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:shadow-lg transition-all duration-300"
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="text-3xl bg-indigo-50 p-3 rounded-xl group-hover:scale-110 transition">🤖</span>
                                                <div className="text-left">
                                                    <p className="text-xl font-bold text-gray-800 group-hover:text-indigo-600 transition">CPUと対戦</p>
                                                    <p className="text-sm text-gray-400 font-medium">一人で練習</p>
                                                </div>
                                            </div>
                                            <svg className="w-6 h-6 text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </button>

                                        <button
                                            onClick={joinRandom}
                                            className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-pink-100 hover:border-pink-500 hover:shadow-lg transition-all duration-300"
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="text-3xl bg-pink-50 p-3 rounded-xl group-hover:scale-110 transition">🌍</span>
                                                <div className="text-left">
                                                    <p className="text-xl font-bold text-gray-800 group-hover:text-pink-600 transition">誰かと対戦</p>
                                                    <p className="text-sm text-gray-400 font-medium">ランダムマッチ</p>
                                                </div>
                                            </div>
                                            <svg className="w-6 h-6 text-gray-300 group-hover:text-pink-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </button>

                                        <button
                                            onClick={joinFriend}
                                            className="group w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-white border-2 border-teal-100 hover:border-teal-500 hover:shadow-lg transition-all duration-300"
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="text-3xl bg-teal-50 p-3 rounded-xl group-hover:scale-110 transition">🤝</span>
                                                <div className="text-left">
                                                    <p className="text-xl font-bold text-gray-800 group-hover:text-teal-600 transition">友達と対戦</p>
                                                    <p className="text-sm text-gray-400 font-medium">ルームID指定</p>
                                                </div>
                                            </div>
                                            <svg className="w-6 h-6 text-gray-300 group-hover:text-teal-500 group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {loginStep === 'FRIEND' && (
                                <div className="space-y-6 text-center flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
                                    <div className="space-y-2">
                                        <h2 className="text-xl font-bold text-gray-700">ルームIDを入力</h2>
                                        <p className="text-sm text-gray-400">友達から教えてもらったIDを入力してね</p>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={inputRoom}
                                            onChange={(e) => setInputRoom(e.target.value)}
                                            placeholder="1234"
                                            className="w-full text-3xl font-bold text-center py-4 rounded-xl border-2 border-gray-200 bg-white focus:border-[#5B46F5] focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all tracking-widest placeholder-gray-200 shadow-sm"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        onClick={() => joinRoomInternal(inputRoom)}
                                        className="w-full bg-[#5B46F5] text-white text-lg font-bold py-4 rounded-xl hover:bg-indigo-700 hover:-translate-y-0.5 hover:shadow-lg transition-all active:scale-95 active:shadow-none"
                                    >
                                        入室する
                                    </button>
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
                                className="inline-block px-8 py-3 text-gray-500 font-bold hover:text-white hover:bg-gray-400 rounded-full border-2 border-gray-300 transition"
                            >
                                キャンセル
                            </button>
                        </div>
                    )}

                    {gameState === 'PLAYING' && (
                        <div className="flex flex-col h-full justify-between pb-4">

                            {/* Game Header */}
                            <div className="bg-[#5B46F5] text-white px-5 py-3 rounded-2xl mb-2 shadow-md shrink-0 text-left flex flex-col justify-center mx-2 md:mx-auto w-full max-w-2xl">
                                <p className="text-xs opacity-90 font-medium mb-0.5">以下の画像をすべて選択：</p>
                                <h2 className="text-2xl font-bold uppercase tracking-wider leading-none">{target}</h2>
                            </div>

                            {/* Main Content: Player Grid and Rival View */}
                            <div className="flex-1 min-h-0 flex flex-col md:flex-row items-center justify-between gap-10 md:gap-24 w-full max-w-7xl mx-auto px-4 md:px-10">

                                {/* 自分のセクション */}
                                <div className="flex flex-col items-center w-full max-w-2xl">
                                    <h3 className="text-xl md:text-2xl font-bold text-gray-700 mb-2">自分 {playerCombo > 0 && <span className="text-orange-500">Combo: {playerCombo}</span>}</h3>

                                    {/* プレイヤーへの妨害エフェクト適用コンテナ */}
                                    <motion.div
                                        variants={obstructionVariants}
                                        animate={playerEffect === 'SHAKE' || playerEffect === 'SPIN' ? playerEffect : 'NORMAL'}
                                        className={`bg-white rounded-sm p-2 shadow-sm w-full border border-gray-300 flex flex-col ${playerEffect === 'BLUR' ? 'blur-[4px]' : ''} ${playerEffect === 'INVERT' ? 'invert' : ''}`}
                                    >
                                        <div className="grid grid-cols-3 gap-1 w-full aspect-square">
                                            {images.map((img: string, idx: number) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => handleImageClick(idx)}
                                                    className="relative w-full h-full cursor-pointer overflow-hidden group bg-gray-100"
                                                >
                                                    <div className={`w-full h-full transition-transform duration-100 ${mySelections.includes(idx) ? 'scale-75' : 'scale-100 group-hover:opacity-90'}`}>
                                                        {/* 画像のサイズ統一: object-cover と aspect-square で強制的に正方形にトリミング */}
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
                                        {/* 確認ボタン */}
                                        <div className="flex justify-center mt-2">
                                            <button
                                                onClick={handleVerify}
                                                className="bg-[#4285F4] hover:bg-[#3367D6] text-white font-bold py-2 px-6 rounded text-sm uppercase tracking-wide transition shadow-sm active:shadow-inner"
                                            >
                                                確認
                                            </button>
                                        </div>
                                    </motion.div>
                                </div>

                                {/* 相手のセクション */}
                                <div className="w-full md:w-auto md:h-full flex flex-col justify-center items-center shrink-0">
                                    <h3 className="text-xl md:text-2xl font-bold text-gray-700 mb-2">相手 {opponentCombo > 0 && <span className="text-orange-500">Combo: {opponentCombo}</span>}</h3>

                                    {/* 相手への妨害エフェクト適用コンテナ */}
                                    <motion.div
                                        variants={obstructionVariants}
                                        animate={opponentEffect === 'SHAKE' || opponentEffect === 'SPIN' ? opponentEffect : 'NORMAL'}
                                        className={`bg-gray-100 rounded-sm p-2 flex flex-col items-center shadow-inner md:w-48 border border-gray-300 ${opponentEffect === 'BLUR' ? 'blur-[4px]' : ''} ${opponentEffect === 'INVERT' ? 'invert' : ''}`}
                                    >
                                        <div className="flex items-center gap-2 mb-2 w-full justify-center">
                                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                            <p className="text-xs font-bold text-gray-500">RIVAL VIEW</p>
                                        </div>
                                        <div className="grid grid-cols-3 gap-0.5 w-32 md:w-full opacity-90">
                                            {rivalImages.map((img: string, idx: number) => (
                                                <div
                                                    key={`opp-${idx}`}
                                                    className="relative aspect-square overflow-hidden bg-gray-300"
                                                >
                                                    <div className={`w-full h-full transition-transform duration-100 ${opponentSelections.includes(idx) ? 'scale-75' : ''}`}>
                                                        {/* 相手の画像もサイズ統一: object-cover と aspect-square */}
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

                            {/* Status Bar */}
                            <div className="shrink-0 flex justify-between items-center text-lg md:text-xl font-bold text-gray-600 px-4 mt-2 w-full max-w-5xl mx-auto">
                                <div className="flex items-center gap-3">
                                    <span className="w-4 h-4 rounded-full bg-green-500 shadow-sm"></span>
                                    You: {myScore}/5
                                </div>
                                <div className="flex-1 mx-6 h-4 bg-gray-200 rounded-full overflow-hidden relative shadow-inner">
                                    <div
                                        className="absolute top-0 left-0 h-full bg-[#5B46F5] transition-all duration-500 ease-out"
                                        style={{ width: `${(myScore / 5) * 100}%` }}
                                    ></div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {gameMode === 'CPU' ? 'CPU' : 'Rival'}: {opponentScore}/5
                                    <span className="w-4 h-4 rounded-full bg-red-500 shadow-sm"></span>
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