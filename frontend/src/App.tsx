import React, { useEffect, useState } from 'react';
import useWebSocket from 'react-use-websocket';
import { motion } from 'framer-motion';
import { useGameStore } from './store';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

function App() {
    const {
        gameState, roomId, playerId, target, images, opponentScore, isCpuMode,
        setGameState, setRoomInfo, startGame, updateOpponentScore, endGame, winner
    } = useGameStore();

    const [inputRoom, setInputRoom] = useState('');
    const { sendMessage, lastMessage } = useWebSocket(isCpuMode ? null : WS_URL, {
        onOpen: () => console.log('Connected to Server'),
        shouldReconnect: () => true,
    });

    // CPU戦のロジック
    useEffect(() => {
        if (gameState === 'PLAYING' && isCpuMode) {
            const interval = setInterval(() => {
                if (opponentScore < 5) {
                    const newScore = opponentScore + 1;
                    updateOpponentScore(newScore);
                    if (newScore >= 5) endGame('CPU');
                }
            }, Math.random() * 2000 + 1000);
            return () => clearInterval(interval);
        }
    }, [gameState, isCpuMode, opponentScore, updateOpponentScore, endGame]);

    useEffect(() => {
        if (lastMessage !== null) {
            try {
                const msg = JSON.parse(lastMessage.data);
                switch (msg.type) {
                    case 'STATUS_UPDATE': setGameState('WAITING'); break;
                    case 'GAME_START': startGame(msg.payload.target, msg.payload.images); break;
                    case 'OPPONENT_PROGRESS':
                        if (msg.payload.player_id !== playerId) updateOpponentScore(msg.payload.correct_count);
                        break;
                    case 'GAME_FINISHED': endGame(msg.payload.winner_id); break;
                }
            } catch (e) { console.error(e); }
        }
    }, [lastMessage, setGameState, startGame, updateOpponentScore, endGame, playerId]);

    const joinRoom = (mode: 'PVP' | 'CPU') => {
        if (mode === 'PVP') {
            if (!inputRoom) return;
            setRoomInfo(inputRoom, playerId, false);
            sendMessage(JSON.stringify({ type: 'JOIN_ROOM', payload: { room_id: inputRoom, player_id: playerId } }));
        } else {
            setRoomInfo('CPU_ROOM', playerId, true);
            const mockImages = Array.from({ length: 9 }, (_, i) => `https://via.placeholder.com/150?text=Img+${i}`);
            startGame('Traffic Lights', mockImages);
        }
    };

    const handleImageClick = (index: number) => {
        if (isCpuMode) {
            const newScore = useGameStore.getState().score + 1;
            useGameStore.setState({ score: newScore });
            if (newScore >= 5) endGame(playerId);
        } else {
            sendMessage(JSON.stringify({ type: 'SELECT_IMAGE', payload: { room_id: roomId, player_id: playerId, image_index: index } }));
        }
    };

    return (
        <div className="min-h-screen bg-[#F1F3F4] flex items-center justify-center font-sans text-gray-800">
            <div className="bg-white p-6 rounded-sm shadow-xl max-w-lg w-full border border-gray-300">
                <div className="bg-[#4285F4] text-white p-5 mb-4 flex justify-between items-center">
                    <div>
                        <p className="text-xs opacity-90 leading-tight">くそうざいreCAPTCHAを面白くしよう！</p>
                        <h1 className="text-2xl font-black italic tracking-tighter">reCAPTCHA ゲーム</h1>
                    </div>
                    <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" className="w-10 h-10" alt="logo" />
                </div>

                {gameState === 'LOGIN' && (
                    <div className="space-y-6">
                        <div className="border-l-4 border-[#4285F4] pl-4 py-1">
                            <h2 className="text-xl font-bold">遊び方</h2>
                            <ul className="text-sm space-y-1 mt-2 text-gray-600">
                                <li>・指定されたお題の画像をすべて選んでください</li>
                                <li>・誰よりも早く「人間」であることを証明しましょう</li>
                                <li>・制限時間は60秒です</li>
                            </ul>
                        </div>
                        <input
                            type="text" value={inputRoom} onChange={(e) => setInputRoom(e.target.value)}
                            placeholder="ルームIDを入力 (対人戦のみ)"
                            className="w-full p-3 border border-gray-300 focus:ring-2 focus:ring-[#4285F4] outline-none"
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => joinRoom('PVP')} className="bg-[#4285F4] text-white py-3 font-bold hover:bg-blue-600 transition shadow-md">誰かと対戦する</button>
                            <button onClick={() => joinRoom('CPU')} className="bg-gray-700 text-white py-3 font-bold hover:bg-gray-800 transition shadow-md">CPUと対戦する</button>
                        </div>
                    </div>
                )}

                {gameState === 'WAITING' && (
                    <div className="text-center py-10">
                        <div className="animate-spin h-8 w-8 border-4 border-[#4285F4] border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="font-bold text-lg">対戦相手を探しています...</p>
                        <p className="text-xs text-gray-400 mt-2">Room ID: {roomId}</p>
                    </div>
                )}

                {gameState === 'PLAYING' && (
                    <div>
                        <div className="bg-[#4285F4] text-white p-4 mb-2">
                            <p className="text-sm">お題：以下の画像の中から</p>
                            <h2 className="text-3xl font-black uppercase tracking-tight">{target}</h2>
                            <p className="text-sm mt-1">に該当するものをすべて選択してください。</p>
                        </div>
                        <div className="grid grid-cols-3 gap-1 mb-4">
                            {images.map((img, idx) => (
                                <motion.div key={idx} whileTap={{ scale: 0.95 }} onClick={() => handleImageClick(idx)} className="aspect-square cursor-pointer overflow-hidden bg-gray-200 border border-white">
                                    <img src={img} className="w-full h-full object-cover" alt="captcha" />
                                </motion.div>
                            ))}
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold">
                                <span>YOU: {isCpuMode ? useGameStore.getState().score : '...'} / 5</span>
                                <span>{isCpuMode ? 'CPU' : 'Rival'}: {opponentScore} / 5</span>
                            </div>
                            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden flex">
                                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(useGameStore.getState().score / 5) * 50}%` }}></div>
                                <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${(opponentScore / 5) * 50}%` }}></div>
                            </div>
                        </div>
                    </div>
                )}

                {gameState === 'RESULT' && (
                    <div className="text-center py-8">
                        {winner === playerId ? (
                            <div className="text-green-600">
                                <h2 className="text-4xl font-black italic">YOU ARE HUMAN!</h2>
                                <p className="mt-2">あなたはボットではありません。</p>
                            </div>
                        ) : (
                            <div className="text-red-600">
                                <h2 className="text-4xl font-black italic">ROBOT DETECTED</h2>
                                <p className="mt-2">アクセスが拒否されました。</p>
                            </div>
                        )}
                        <button onClick={() => window.location.reload()} className="mt-8 bg-[#4285F4] text-white px-8 py-2 font-bold shadow-lg">もう一度遊ぶ</button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;