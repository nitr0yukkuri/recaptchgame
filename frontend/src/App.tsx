/// <reference types="vite/client" />
import React, { useEffect, useState } from 'react';
import useWebSocket from 'react-use-websocket';
import { motion } from 'framer-motion';
import { useGameStore } from './store';

// Render環境変数 VITE_WS_URL があればそれを使用、なければlocalhost
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

// CPU対戦用のモックデータ
const CPU_GAME_DATA = {
    target: 'CARS',
    images: [
        'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=300&q=80',
        'https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&w=300&q=80',
        'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=300&q=80',
        'https://images.unsplash.com/photo-1532974297617-c0f05fe48bff?auto=format&fit=crop&w=300&q=80',
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=300&q=80',
        'https://images.unsplash.com/photo-1503376763036-066120622c74?auto=format&fit=crop&w=300&q=80',
        'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=300&q=80',
        'https://images.unsplash.com/photo-1580273916550-e323be2ebcc6?auto=format&fit=crop&w=300&q=80',
        'https://images.unsplash.com/photo-1494905998402-395d579af905?auto=format&fit=crop&w=300&q=80',
    ]
};

function App() {
    const {
        gameState, roomId, playerId, target, images, opponentScore,
        setGameState, setRoomInfo, startGame, updateOpponentScore, endGame, winner
    } = useGameStore();

    const [inputRoom, setInputRoom] = useState('');
    const [gameMode, setGameMode] = useState<'CPU' | 'ONLINE' | null>(null);
    const [loginStep, setLoginStep] = useState<'SELECT' | 'FRIEND' | 'WAITING'>('SELECT');

    const { sendMessage, lastMessage } = useWebSocket(WS_URL, {
        onOpen: () => console.log('Connected to Server'),
        shouldReconnect: () => true,
    });

    // CPU対戦ロジック
    useEffect(() => {
        if (gameMode === 'CPU' && gameState === 'PLAYING') {
            const interval = setInterval(() => {
                if (Math.random() > 0.6) {
                    useGameStore.getState().updateOpponentScore(useGameStore.getState().opponentScore + 1);
                }
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [gameMode, gameState]);

    // CPUの勝利判定監視
    useEffect(() => {
        if (gameMode === 'CPU' && opponentScore >= 5 && gameState === 'PLAYING') {
            endGame('cpu');
        }
    }, [opponentScore, gameMode, gameState, endGame]);


    useEffect(() => {
        if (gameMode === 'CPU') return;

        if (lastMessage !== null) {
            try {
                const msg = JSON.parse(lastMessage.data);
                switch (msg.type) {
                    case 'STATUS_UPDATE':
                        setGameState('WAITING');
                        break;
                    case 'GAME_START':
                        startGame(msg.payload.target, msg.payload.images);
                        break;
                    case 'OPPONENT_PROGRESS':
                        if (msg.payload.player_id !== playerId) {
                            updateOpponentScore(msg.payload.correct_count);
                        }
                        break;
                    case 'GAME_FINISHED':
                        endGame(msg.payload.winner_id);
                        break;
                }
            } catch (e) {
                console.error("Failed to parse message:", e);
            }
        }
    }, [lastMessage, setGameState, startGame, updateOpponentScore, endGame, playerId, gameMode]);

    const startCpuGame = () => {
        setGameMode('CPU');
        setRoomInfo('LOCAL_CPU', playerId);
        startGame(CPU_GAME_DATA.target, CPU_GAME_DATA.images);
    };

    const joinRandom = () => {
        setGameMode('ONLINE');
        const randomRoom = 'PUB_' + Math.floor(Math.random() * 5);
        setInputRoom(randomRoom);
        joinRoomInternal(randomRoom);
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
        if (gameMode === 'CPU') {
            sendMessage(JSON.stringify({
                type: 'SELECT_IMAGE',
                payload: { room_id: 'LOCAL', player_id: playerId, image_index: index }
            }));
        } else {
            sendMessage(JSON.stringify({
                type: 'SELECT_IMAGE',
                payload: { room_id: roomId, player_id: playerId, image_index: index }
            }));
        }
    };

    // 待機キャンセル処理
    const cancelWaiting = () => {
        setGameState('LOGIN');
        setLoginStep('SELECT');
    };

    // ホームに戻る処理
    const goHome = () => {
        setGameState('LOGIN');
        setLoginStep('SELECT');
        setGameMode(null);
        setInputRoom('');
    };

    return (
        <div className="h-screen w-screen bg-white flex flex-col items-center p-4 md:p-8 font-sans text-gray-800 overflow-hidden relative">

            <div className="w-full h-full max-w-4xl flex flex-col relative">

                {/* ホームに戻るボタン */}
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

                {/* --- HEADER --- */}
                <div className="flex flex-col items-center mb-4 md:mb-6 shrink-0">
                    <h1 className="text-4xl md:text-5xl font-bold flex items-center gap-3 mb-2">
                        <span className="text-[#4A90E2]">reCAPTCHA</span>
                        <span className="text-[#BFA15F]">ゲーム</span>
                    </h1>
                </div>

                {/* --- CONTENT AREA --- */}
                <div className="flex-1 flex flex-col w-full min-h-0 overflow-y-auto">

                    {gameState === 'LOGIN' && (
                        <div className="animate-fade-in w-full max-w-4xl mx-auto h-full flex flex-col">

                            {/* 統合されたホーム画面 */}
                            {loginStep === 'SELECT' && (
                                <div className="flex flex-col items-center justify-center gap-8 h-full py-4">

                                    {/* 説明とルール: lg:text-left を削除し中央揃えに統一 */}
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
                                                    画像選択などのチャレンジをクリア
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <span className="text-[#5B46F5] font-bold text-xl">✓</span>
                                                    正解するたびに1ポイント獲得
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <span className="text-[#5B46F5] font-bold text-xl">✓</span>
                                                    制限時間は60秒
                                                </li>
                                            </ul>
                                        </div>
                                    </div>

                                    {/* モード選択ボタン */}
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

                            {/* 友達対戦用ルーム入力 */}
                            {loginStep === 'FRIEND' && (
                                <div className="space-y-8 text-center flex-1 flex flex-col justify-center max-w-lg mx-auto w-full">
                                    <h2 className="text-3xl font-bold text-gray-700">ルームIDを入力</h2>
                                    <input
                                        type="text"
                                        value={inputRoom}
                                        onChange={(e) => setInputRoom(e.target.value)}
                                        placeholder="123"
                                        className="w-full text-6xl font-black text-center py-8 rounded-3xl border-4 border-gray-200 bg-gray-50 focus:border-[#5B46F5] focus:ring-0 outline-none transition"
                                    />
                                    <button
                                        onClick={() => joinRoomInternal(inputRoom)}
                                        className="w-full bg-[#5B46F5] text-white text-2xl font-bold py-5 rounded-2xl hover:bg-indigo-700 transition shadow-xl"
                                    >
                                        入室
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- WAITING SCREEN --- */}
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

                    {/* --- GAME SCREEN --- */}
                    {gameState === 'PLAYING' && (
                        <div className="flex flex-col h-full">
                            {/* Game Header */}
                            <div className="bg-[#5B46F5] text-white p-6 rounded-3xl mb-4 shadow-lg text-center shrink-0">
                                <p className="text-sm md:text-base opacity-90 mb-1">以下の画像をすべて選択：</p>
                                <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-wider">{target}</h2>
                            </div>

                            {/* Grid */}
                            <div className="flex-1 min-h-0 bg-gray-100 rounded-3xl p-3 md:p-4 mb-4 overflow-hidden">
                                <div className="grid grid-cols-3 gap-2 md:gap-4 h-full w-full">
                                    {images.map((img: string, idx: number) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleImageClick(idx)}
                                            className="relative w-full h-full cursor-pointer overflow-hidden rounded-xl border-4 border-transparent hover:border-[#5B46F5] transition"
                                        >
                                            <img src={img} alt="captcha" className="w-full h-full object-cover" />
                                        </motion.div>
                                    ))}
                                </div>
                            </div>

                            {/* Status Bar */}
                            <div className="shrink-0 flex justify-between items-center text-base md:text-lg font-bold text-gray-600 px-2 pb-2">
                                <div className="flex items-center gap-3">
                                    <span className="w-4 h-4 rounded-full bg-green-500 shadow-sm"></span>
                                    You
                                </div>
                                <div className="flex-1 mx-6 h-4 bg-gray-200 rounded-full overflow-hidden relative shadow-inner">
                                    <div
                                        className="absolute top-0 left-0 h-full bg-[#5B46F5] transition-all duration-500 ease-out"
                                        style={{ width: `${(opponentScore / 5) * 100}%` }}
                                    ></div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {gameMode === 'CPU' ? 'CPU' : 'Rival'}: {opponentScore}/5
                                    <span className="w-4 h-4 rounded-full bg-red-500 shadow-sm"></span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- RESULT SCREEN --- */}
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
                                        <h2 className="text-4xl md:text-5xl font-black text-gray-800">ROBOT DETECTED</h2>
                                        <p className="text-xl text-gray-500 mt-3">アクセスが拒否されました。</p>
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