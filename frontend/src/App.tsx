/// <reference types="vite/client" />
import { useEffect, useState, useRef } from 'react';
import useWebSocket from 'react-use-websocket';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, ObstructionType } from './store';
import { useSound } from './useSound';
import { generateCpuProblem, getCorrectIndices, getRandomObstruction, sleep } from './utils/game';

import { LoginScreen } from './components/LoginScreen';
import { WaitingScreen } from './components/WaitingScreen';
import { GameScreen } from './components/GameScreen';
import { ResultScreen } from './components/ResultScreen';

// Render環境変数 VITE_WS_URL があればそれを使用、なければlocalhost
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

const STATIC_WS_OPTIONS = {
    onOpen: () => console.log('Connected to Server'),
    shouldReconnect: () => true,
};

function App() {
    const {
        gameState, roomId, playerId, target, images,
        cpuDifficulty,
        opponentScore, mySelections,
        setGameState, setRoomInfo, startGame,
        updateCpuPattern, updatePlayerPattern,
        updateOpponentScore, toggleOpponentSelection,
        resetOpponentSelections, toggleMySelection, resetMySelections, endGame,
        feedback, setFeedback, setCpuDifficulty,
        playerCombo, playerEffect, opponentEffect,
        setPlayerCombo, setPlayerEffect, setOpponentEffect, setOpponentCombo
    } = useGameStore();

    const [inputRoom, setInputRoom] = useState('');
    const [loginError, setLoginError] = useState('');
    const [gameMode, setGameMode] = useState<'CPU' | 'ONLINE' | null>(null);
    const [loginStep, setLoginStep] = useState<'SELECT' | 'FRIEND' | 'FRIEND_INPUT' | 'WAITING' | 'DIFFICULTY'>('SELECT');
    const [myScore, setMyScore] = useState<number>(0);
    const [isReloading, setIsReloading] = useState(false);
    const [settingScore, setSettingScore] = useState(5);
    const [winningScore, setWinningScore] = useState(5);
    const [isVerifying, setIsVerifying] = useState(false);
    const [startPopup, setStartPopup] = useState(false);
    const [startMessage, setStartMessage] = useState('Start!');
    const [isCreator, setIsCreator] = useState(false);
    const isMatchingRef = useRef(false);
    const prevMessageRef = useRef<MessageEvent<any> | null>(null);

    const { initAudio, playError, playSuccess, playWin, playLose, playObstruction, playStart } = useSound();
    const { sendMessage, lastMessage } = useWebSocket(WS_URL, STATIC_WS_OPTIONS);

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

    useEffect(() => {
        if (gameMode === 'CPU' && gameState === 'PLAYING') {
            let intervalTime = 800;
            let actionProb = 0.3;
            let submitProb = 0.5;

            if (cpuDifficulty === 1) {
                intervalTime = 1200;
                actionProb = 0.5;
                submitProb = 0.3;
            } else if (cpuDifficulty === 3) {
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
                        const nextProb = generateCpuProblem(store.cpuTarget);
                        store.updateCpuPattern(nextProb.target, nextProb.images);
                    }
                }
            }, intervalTime);
            return () => clearInterval(interval);
        }
    }, [gameMode, gameState, cpuDifficulty]);

    useEffect(() => {
        if (gameMode === 'CPU' && gameState === 'PLAYING') {
            if (opponentScore >= winningScore) {
                playLose();
                endGame('cpu');
            } else if (myScore >= winningScore) {
                playWin();
                endGame('human');
            }
        }
    }, [opponentScore, myScore, gameMode, gameState, endGame, playWin, playLose, winningScore]);

    useEffect(() => {
        if (lastMessage !== null) {
            if (lastMessage === prevMessageRef.current) return;
            prevMessageRef.current = lastMessage;

            try {
                const msg = JSON.parse(lastMessage.data);
                switch (msg.type) {
                    case 'ROOM_ASSIGNED':
                        setRoomInfo(msg.payload.room_id, playerId);
                        setGameMode('ONLINE');
                        setGameState('WAITING');
                        break;
                    case 'STATUS_UPDATE':
                        setGameState('WAITING');
                        break;
                    case 'GAME_START':
                        if (isMatchingRef.current) return;
                        isMatchingRef.current = true;
                        setGameMode('ONLINE');

                        startGame(msg.payload.target, msg.payload.images);
                        if (msg.payload.opponent_images) {
                            updateCpuPattern("", msg.payload.opponent_images);
                        }
                        if (msg.payload.winning_score) {
                            setWinningScore(msg.payload.winning_score);
                        }
                        setMyScore(0);
                        setIsVerifying(false);
                        setPlayerCombo(0);
                        setOpponentCombo(0);

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
                        setPlayerCombo(playerCombo + 1);
                        setTimeout(() => setFeedback(null), 1000);
                        break;

                    case 'OPPONENT_UPDATE':
                        updateCpuPattern("", msg.payload.images);
                        updateOpponentScore(msg.payload.score);
                        if (msg.payload.combo !== undefined) {
                            setOpponentCombo(msg.payload.combo);
                        }
                        resetOpponentSelections();
                        break;

                    case 'OBSTRUCTION':
                        if (msg.payload.attacker_id === playerId) {
                            setOpponentEffect(msg.payload.effect as ObstructionType);
                            setPlayerCombo(0);
                        } else {
                            setPlayerEffect(msg.payload.effect as ObstructionType);
                            setOpponentCombo(0);
                        }
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
                            setPlayerCombo(0);
                            setTimeout(() => setFeedback(null), 1000);
                            resetMySelections();
                        }
                        break;
                }
            } catch (e) {
                console.error("Failed to parse message:", e);
            }
        }
    }, [lastMessage, setGameState, startGame, updateCpuPattern, updatePlayerPattern, updateOpponentScore, toggleOpponentSelection, resetOpponentSelections, resetMySelections, endGame, playerId, gameMode, setRoomInfo, setFeedback, setPlayerEffect, playError, playSuccess, playWin, playLose, playStart, feedback, playerCombo]);

    const startCpuFlow = () => {
        initAudio();
        setSettingScore(5);
        setLoginStep('DIFFICULTY');
    };

    const confirmDifficulty = (level: number) => {
        playStart();
        setCpuDifficulty(level);
        setWinningScore(settingScore);
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
            payload: { room_id: "RANDOM", player_id: playerId, winning_score: 5 }
        }));
    };

    const joinFriend = () => {
        initAudio();
        setLoginStep('FRIEND');
    };

    const createRoom = () => {
        setIsCreator(true);
        setSettingScore(5);
        setLoginError('');
        setLoginStep('FRIEND_INPUT');
    };

    const enterRoomFlow = () => {
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
            payload: { room_id: room, player_id: playerId, winning_score: settingScore }
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
                if (myScore + 1 < winningScore) {
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
                        <LoginScreen
                            loginStep={loginStep}
                            isCreator={isCreator}
                            loginError={loginError}
                            inputRoom={inputRoom}
                            setInputRoom={setInputRoom}
                            setLoginError={setLoginError}
                            settingScore={settingScore}
                            setSettingScore={setSettingScore}
                            startCpuFlow={startCpuFlow}
                            joinRandom={joinRandom}
                            joinFriend={joinFriend}
                            createRoom={createRoom}
                            enterRoomFlow={enterRoomFlow}
                            joinRoomInternal={joinRoomInternal}
                            confirmDifficulty={confirmDifficulty}
                        />
                    )}

                    {gameState === 'WAITING' && (
                        <WaitingScreen roomId={roomId} cancelWaiting={cancelWaiting} />
                    )}

                    {gameState === 'PLAYING' && (
                        <GameScreen
                            myScore={myScore}
                            winningScore={winningScore}
                            gameMode={gameMode}
                            isReloading={isReloading}
                            isVerifying={isVerifying}
                            handleImageClick={handleImageClick}
                            handleReload={handleReload}
                            handleVerify={handleVerify}
                        />
                    )}

                    {gameState === 'RESULT' && (
                        <ResultScreen gameMode={gameMode} />
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;