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
    // 初期状態は 'LANDING' (ゲームスタート画面)
    const [loginStep, setLoginStep] = useState<'LANDING' | 'SELECT' | 'FRIEND' | 'WAITING'>('LANDING');

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

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-gray-800">
            <div className="bg-white w-full max-w-[520px] rounded-3xl shadow-xl p-8 border border-gray-100 relative overflow-hidden">

                {/* --- HEADER --- */}
                <div className="flex flex-col items-center mb-6">
                    <h1 className="text-3xl font-bold flex items-center gap-2 mb-1">
                        <span className="text-[#4A90E2]">reCAPTCHA</span>
                        <span className="text-[#BFA15F]">ゲーム</span>
                    </h1>
                    <p className="text-sm text-gray-500">あなたはロボットですか？</p>
                </div>

                {/* --- LOGIN & MODE SELECTION --- */}
                {gameState === 'LOGIN' && (
                    <div className="animate-fade-in">

                        {/* 1. ランディング画面 (ゲームスタートボタン) */}
                        {loginStep === 'LANDING' && (
                            <div className="space-y-8 text-center">
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-600 font-medium">くそうざいreCAPTCHAを面白くしよう！</p>
                                    <h2 className="text-2xl font-bold text-[#5B46F5] leading-relaxed">
                                        60秒以内に何回人間か<br />証明できる？
                                    </h2>
                                </div>

                                <div className="bg-[#F9F9F7] p-6 rounded-2xl text-left space-y-3">
                                    <h3 className="text-center font-bold text-gray-800 mb-2">ルール：</h3>
                                    <ul className="space-y-3 text-sm text-gray-700 font-medium">
                                        <li className="flex items-start gap-3">
                                            <span className="text-[#5B46F5] font-bold mt-0.5">✓</span>
                                            画像選択、テキスト入力、計算問題などのチャレンジをクリア
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-[#5B46F5] font-bold mt-0.5">✓</span>
                                            正解するたびに1ポイント獲得
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-[#5B46F5] font-bold mt-0.5">✓</span>
                                            制限時間は60秒
                                        </li>
                                    </ul>
                                </div>

                                <button
                                    onClick={() => setLoginStep('SELECT')}
                                    className="w-full bg-[#5B46F5] text-white font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition transform active:scale-95 text-lg"
                                >
                                    ゲームスタート！
                                </button>
                            </div>
                        )}

                        {/* 2. モード選択画面 (ボタン三つ縦並び) */}
                        {loginStep === 'SELECT' && (
                            <div className="space-y-4">
                                <h3 className="text-center font-bold text-gray-400 mb-4">対戦モードを選択</h3>
                                <div className="flex flex-col gap-4">
                                    {/* ボタン1: CPU対戦 */}
                                    <button
                                        onClick={startCpuGame}
                                        className="group flex items-center justify-between px-6 py-5 rounded-xl bg-indigo-50 border-2 border-indigo-100 hover:border-indigo-500 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                    >
                                        <div className="text-left">
                                            <p className="text-xl font-black">CPUと対戦</p>
                                            <p className="text-xs opacity-60 font-bold">一人で練習</p>
                                        </div>
                                        <span className="text-4xl">🤖</span>
                                    </button>

                                    {/* ボタン2: 誰かと対戦 */}
                                    <button
                                        onClick={joinRandom}
                                        className="group flex items-center justify-between px-6 py-5 rounded-xl bg-pink-50 border-2 border-pink-100 hover:border-pink-500 hover:bg-pink-600 hover:text-white transition-all shadow-sm"
                                    >
                                        <div className="text-left">
                                            <p className="text-xl font-black">誰かと対戦</p>
                                            <p className="text-xs opacity-60 font-bold">ランダムマッチ</p>
                                        </div>
                                        <span className="text-4xl">🌍</span>
                                    </button>

                                    {/* ボタン3: 友達と対戦 */}
                                    <button
                                        onClick={joinFriend}
                                        className="group flex items-center justify-between px-6 py-5 rounded-xl bg-teal-50 border-2 border-teal-100 hover:border-teal-500 hover:bg-teal-600 hover:text-white transition-all shadow-sm"
                                    >
                                        <div className="text-left">
                                            <p className="text-xl font-black">友達と対戦</p>
                                            <p className="text-xs opacity-60 font-bold">ルームID指定</p>
                                        </div>
                                        <span className="text-4xl">🤝</span>
                                    </button>
                                </div>
                                <button
                                    onClick={() => setLoginStep('LANDING')}
                                    className="w-full py-4 text-gray-400 text-sm hover:text-gray-600 font-bold"
                                >
                                    戻る
                                </button>
                            </div>
                        )}

                        {/* 3. 友達対戦用ルーム入力 */}
                        {loginStep === 'FRIEND' && (
                            <div className="space-y-6 text-center pt-4">
                                <h2 className="text-xl font-bold text-gray-700">ルームIDを入力</h2>
                                <input
                                    type="text"
                                    value={inputRoom}
                                    onChange={(e) => setInputRoom(e.target.value)}
                                    placeholder="123"
                                    className="w-full text-4xl font-black text-center py-6 rounded-xl border-2 border-gray-200 bg-gray-50 focus:border-[#5B46F5] focus:ring-0 outline-none transition"
                                />
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setLoginStep('SELECT')}
                                        className="flex-1 py-4 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition"
                                    >
                                        戻る
                                    </button>
                                    <button
                                        onClick={() => joinRoomInternal(inputRoom)}
                                        className="flex-[2] bg-[#5B46F5] text-white text-lg font-bold py-4 rounded-xl hover:bg-indigo-700 transition shadow-lg"
                                    >
                                        入室
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- WAITING SCREEN --- */}
                {gameState === 'WAITING' && (
                    <div className="text-center py-12 space-y-6">
                        <div className="animate-spin h-12 w-12 border-4 border-[#5B46F5] border-t-transparent rounded-full mx-auto"></div>
                        <div>
                            <p className="text-xl font-bold text-gray-700">対戦相手を待機中...</p>
                            <p className="text-sm text-gray-400 mt-2">Room: {roomId}</p>
                        </div>
                    </div>
                )}

                {/* --- GAME SCREEN --- */}
                {gameState === 'PLAYING' && (
                    <div>
                        {/* Game Header */}
                        <div className="bg-[#5B46F5] text-white p-5 rounded-xl mb-6 shadow-md text-center">
                            <p className="text-xs opacity-90 mb-1">以下の画像をすべて選択：</p>
                            <h2 className="text-3xl font-bold uppercase tracking-wider">{target}</h2>
                        </div>

                        {/* Grid */}
                        <div className="grid grid-cols-3 gap-2 mb-6 p-2 bg-gray-100 rounded-lg">
                            {images.map((img: string, idx: number) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleImageClick(idx)}
                                    className="relative aspect-square cursor-pointer overflow-hidden rounded-md border-2 border-transparent hover:border-[#5B46F5] transition"
                                >
                                    <img src={img} alt="captcha" className="w-full h-full object-cover" />
                                </motion.div>
                            ))}
                        </div>

                        {/* Status Bar */}
                        <div className="flex justify-between items-center text-sm font-bold text-gray-600 px-1">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                                You
                            </div>
                            <div className="flex-1 mx-4 h-3 bg-gray-200 rounded-full overflow-hidden relative">
                                <div
                                    className="absolute top-0 left-0 h-full bg-[#5B46F5] transition-all duration-500 ease-out"
                                    style={{ width: `${(opponentScore / 5) * 100}%` }}
                                ></div>
                            </div>
                            <div className="flex items-center gap-2">
                                {gameMode === 'CPU' ? 'CPU' : 'Rival'}: {opponentScore}/5
                                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                            </div>
                        </div>
                        <p className="text-xs text-center text-gray-400 mt-4">該当する画像がない場合はクリックして更新</p>
                    </div>
                )}

                {/* --- RESULT SCREEN --- */}
                {gameState === 'RESULT' && (
                    <div className="text-center py-8">
                        {winner === playerId || (winner === 'human' && gameMode === 'CPU') ? (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-green-600 space-y-4">
                                <div className="bg-green-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span className="text-4xl">🎉</span>
                                </div>
                                <div>
                                    <h2 className="text-3xl font-bold text-gray-800">You are Human!</h2>
                                    <p className="text-gray-500 mt-2">人間であることが証明されました。</p>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-red-600 space-y-4">
                                <div className="bg-red-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span className="text-4xl">🤖</span>
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black text-gray-800">ROBOT DETECTED</h2>
                                    <p className="text-gray-500 mt-2">アクセスが拒否されました。</p>
                                </div>
                            </motion.div>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-10 px-8 py-3 bg-gray-800 text-white rounded-lg font-bold hover:bg-gray-900 transition shadow-lg w-full"
                        >
                            もう一度プレイ
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}

export default App;