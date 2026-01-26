/// <reference types="vite/client" />
import React, { useEffect, useState } from 'react';
import useWebSocket from 'react-use-websocket';
import { motion } from 'framer-motion';
import { useGameStore } from './store';

// Render環境変数 VITE_WS_URL があればそれを使用、なければlocalhost
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

function App() {
    const {
        gameState, roomId, playerId, target, images, opponentScore,
        setGameState, setRoomInfo, startGame, updateOpponentScore, endGame, winner
    } = useGameStore();

    const [inputRoom, setInputRoom] = useState('');

    const { sendMessage, lastMessage } = useWebSocket(WS_URL, {
        onOpen: () => console.log('Connected to Server'),
        shouldReconnect: () => true,
    });

    useEffect(() => {
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
    }, [lastMessage, setGameState, startGame, updateOpponentScore, endGame, playerId]);

    const joinRoom = () => {
        if (!inputRoom) return;
        setRoomInfo(inputRoom, playerId);
        sendMessage(JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { room_id: inputRoom, player_id: playerId }
        }));
    };

    const handleImageClick = (index: number) => {
        sendMessage(JSON.stringify({
            type: 'SELECT_IMAGE',
            payload: { room_id: roomId, player_id: playerId, image_index: index }
        }));
    };

    return (
        // 全体の背景色などを画像に合わせて明るくモダンに調整
        <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-gray-800 p-4">
            <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full border border-gray-100">

                {/* --- LOGIN SCREEN (画像のUIを再現) --- */}
                {gameState === 'LOGIN' && (
                    <div className="flex flex-col items-center text-center space-y-6">
                        {/* ヘッダータイトル */}
                        <div className="space-y-1">
                            <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
                                <span className="text-teal-600">reCAPTCHA</span>
                                <span className="text-yellow-600">ゲーム</span>
                            </h1>
                            <p className="text-sm text-gray-500 font-medium">あなたはロボットですか？</p>
                        </div>

                        {/* メインキャッチコピー */}
                        <div className="py-2">
                            <p className="text-sm text-gray-600 mb-2 font-medium">くそうざいreCAPTCHAを面白くしよう！</p>
                            <h2 className="text-2xl font-bold text-indigo-600 leading-tight">
                                60秒以内に何回人間か<br />証明できる？
                            </h2>
                        </div>

                        {/* ルールボックス */}
                        <div className="bg-amber-50 p-6 rounded-2xl w-full text-left space-y-3 border border-amber-100">
                            <h3 className="text-center font-bold text-gray-800 mb-1">ルール：</h3>
                            <ul className="space-y-2 text-sm text-gray-700 font-medium">
                                <li className="flex items-start gap-2">
                                    <span className="text-indigo-500 font-bold">✓</span>
                                    画像選択、テキスト入力、計算問題などのチャレンジをクリア
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-indigo-500 font-bold">✓</span>
                                    正解するたびに1ポイント獲得
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-indigo-500 font-bold">✓</span>
                                    制限時間は60秒
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-indigo-500 font-bold">✓</span>
                                    できるだけ高いスコアを目指そう！
                                </li>
                            </ul>
                        </div>

                        {/* 入力フォームとボタン */}
                        <div className="w-full space-y-4 pt-2">
                            <input
                                type="text"
                                value={inputRoom}
                                onChange={(e) => setInputRoom(e.target.value)}
                                placeholder="ルームIDを入力 (例: 123)"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                            />
                            <button
                                onClick={joinRoom}
                                className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition transform active:scale-95 text-lg"
                            >
                                ゲームスタート！
                            </button>
                        </div>
                    </div>
                )}

                {/* --- WAITING SCREEN --- */}
                {gameState === 'WAITING' && (
                    <div className="text-center py-12 space-y-6">
                        <div className="animate-spin h-12 w-12 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
                        <div>
                            <p className="text-xl font-bold text-gray-700">対戦相手を待機中...</p>
                            <p className="text-sm text-gray-400 mt-2">Room ID: {roomId}</p>
                        </div>
                    </div>
                )}

                {/* --- GAME SCREEN --- */}
                {gameState === 'PLAYING' && (
                    <div>
                        {/* Game Header */}
                        <div className="bg-indigo-600 text-white p-5 rounded-xl mb-6 shadow-md text-center">
                            <p className="text-sm opacity-90">以下の画像をすべて選択：</p>
                            <h2 className="text-3xl font-bold uppercase my-1 tracking-wider">{target}</h2>
                            <p className="text-xs opacity-75">該当する画像がなくなったら確認ボタンを押してください</p>
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
                                    className="relative aspect-square cursor-pointer overflow-hidden rounded-md border-2 border-transparent hover:border-indigo-400 transition"
                                >
                                    <img src={img} alt="captcha" className="w-full h-full object-cover" />
                                </motion.div>
                            ))}
                        </div>

                        {/* Status Bar */}
                        <div className="flex justify-between items-center text-sm font-bold text-gray-600 px-2">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                                You
                            </div>
                            <div className="flex-1 mx-4 h-3 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                                    style={{ width: `${(opponentScore / 5) * 100}%` }}
                                ></div>
                            </div>
                            <div className="flex items-center gap-2">
                                Rival: {opponentScore}/5
                                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- RESULT SCREEN --- */}
                {gameState === 'RESULT' && (
                    <div className="text-center py-10">
                        {winner === playerId ? (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-green-600 space-y-4">
                                <div className="bg-green-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <div>
                                    <h2 className="text-3xl font-bold text-gray-800">You are Human!</h2>
                                    <p className="text-gray-500 mt-2">人間であることが証明されました。</p>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-red-600 space-y-4">
                                <div className="bg-red-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black text-gray-800">ROBOT DETECTED</h2>
                                    <p className="text-gray-500 mt-2">アクセスが拒否されました。</p>
                                </div>
                            </motion.div>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-10 px-8 py-3 bg-gray-800 text-white rounded-lg font-bold hover:bg-gray-900 transition shadow-lg"
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