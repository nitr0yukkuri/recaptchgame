/// <reference types="vite/client" />
import React, { useEffect, useState } from 'react';
import useWebSocket from 'react-use-websocket';
import { motion } from 'framer-motion';
import { useGameStore } from './store';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

// CPUモード用の正解（ファイル名依存）
// 1,2,3,4.jpg が正解と仮定
const CPU_CORRECT_IMAGES = ['/images/1.jpg', '/images/2.jpg', '/images/3.jpg', '/images/4.jpg'];

const CPU_GAME_DATA = {
    target: 'CARS',
    images: [
        '/images/1.jpg',
        '/images/2.jpg',
        '/images/3.jpg',
        '/images/4.jpg',
        '/images/5.png',
        '/images/6.jpg',
        '/images/7.jpg',
        '/images/8.jpg',
        '/images/9.jpg',
    ],
};

function App() {
    const {
        gameState, roomId, playerId, target, images, opponentScore, opponentSelections, mySelections,
        setGameState, setRoomInfo, startGame, updateOpponentScore, toggleOpponentSelection,
        resetOpponentSelections, toggleMySelection, resetMySelections, endGame, winner
    } = useGameStore();

    const [inputRoom, setInputRoom] = useState('');
    const [gameMode, setGameMode] = useState<'CPU' | 'ONLINE' | null>(null);
    const [loginStep, setLoginStep] = useState<'SELECT' | 'FRIEND' | 'WAITING'>('SELECT');
    const [myScore, setMyScore] = useState(0);

    const { sendMessage, lastMessage } = useWebSocket(WS_URL, {
        onOpen: () => console.log('Connected to Server'),
        shouldReconnect: () => true,
    });

    // CPU対戦ロジック（行動シミュレーション）
    useEffect(() => {
        if (gameMode === 'CPU' && gameState === 'PLAYING') {
            const interval = setInterval(() => {
                const store = useGameStore.getState();
                const currentSelections = store.opponentSelections;

                // CPUの正解インデックスを計算
                const correctIndices = CPU_GAME_DATA.images
                    .map((img, idx) => CPU_CORRECT_IMAGES.includes(img) ? idx : -1)
                    .filter(idx => idx !== -1);

                // まだ選んでいない正解を探す
                const remaining = correctIndices.filter(i => !currentSelections.includes(i));

                if (remaining.length > 0) {
                    if (Math.random() > 0.3) {
                        const next = remaining[Math.floor(Math.random() * remaining.length)];
                        store.toggleOpponentSelection(next);
                    }
                } else {
                    // 全部選び終わったら確認ボタンを押す（スコアアップ & リセット）
                    if (Math.random() > 0.5) {
                        store.updateOpponentScore(store.opponentScore + 1);
                        store.resetOpponentSelections();
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
                        setMyScore(0); // リセットしないと前のスコアが残る可能性あり
                        break;
                    case 'OPPONENT_PROGRESS':
                        if (msg.payload.player_id !== playerId) {
                            updateOpponentScore(msg.payload.correct_count);
                            resetOpponentSelections();
                        } else {
                            // 自分が正解した場合
                            setMyScore(msg.payload.correct_count);
                            resetMySelections();
                        }
                        break;
                    case 'OPPONENT_SELECT':
                        if (msg.payload.player_id !== playerId) {
                            toggleOpponentSelection(msg.payload.image_index);
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
    }, [lastMessage, setGameState, startGame, updateOpponentScore, toggleOpponentSelection, resetOpponentSelections, resetMySelections, endGame, playerId, gameMode]);

    const startCpuGame = () => {
        setGameMode('CPU');
        setRoomInfo('LOCAL_CPU', playerId);
        setMyScore(0);
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

    // 画像クリック（選択のみ）
    const handleImageClick = (index: number) => {
        toggleMySelection(index);

        // オンラインの場合は相手に選択状況を見せる（リアルタイム演出）
        if (gameMode === 'ONLINE') {
            sendMessage(JSON.stringify({
                type: 'SELECT_IMAGE',
                payload: { room_id: roomId, player_id: playerId, image_index: index }
            }));
        }
    };

    // 確認ボタンクリック（判定）
    const handleVerify = () => {
        if (gameMode === 'CPU') {
            // ローカル判定
            const correctIndices = images
                .map((img, idx) => CPU_CORRECT_IMAGES.includes(img) ? idx : -1)
                .filter(idx => idx !== -1);

            const isCorrect =
                mySelections.length === correctIndices.length &&
                mySelections.every(idx => correctIndices.includes(idx));

            if (isCorrect) {
                setMyScore(prev => prev + 1);
                resetMySelections();
                // CPUモードでは画像シャッフルは簡易的に行わないか、リロードさせる
                // ここでは簡易的に選択解除のみ
            } else {
                // 不正解演出（選択リセット）
                resetMySelections();
            }
        } else {
            // サーバーへ判定依頼
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

    return (
        <div className="h-screen w-screen bg-white flex flex-col items-center p-2 font-sans text-gray-800 overflow-hidden relative">

            <div className="w-full h-full max-w-7xl flex flex-col relative">

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
                                                    5ポイント先取で勝利！
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
                                    <h3 className="text-xl md:text-2xl font-bold text-gray-700 mb-2">自分</h3>
                                    <div className="bg-white rounded-sm p-2 shadow-sm w-full border border-gray-300 flex flex-col">
                                        <div className="grid grid-cols-3 gap-1 w-full aspect-square">
                                            {images.map((img: string, idx: number) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => handleImageClick(idx)}
                                                    className="relative w-full h-full cursor-pointer overflow-hidden group"
                                                >
                                                    {/* 画像本体：選択時は縮小して枠線を見せる */}
                                                    <div className={`w-full h-full transition-transform duration-100 ${mySelections.includes(idx) ? 'scale-75' : 'scale-100 group-hover:opacity-90'}`}>
                                                        <img
                                                            src={img}
                                                            alt="captcha"
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>

                                                    {/* 選択時のチェックマーク（reCAPTCHA風） */}
                                                    {mySelections.includes(idx) && (
                                                        <div className="absolute top-0 left-0 text-white bg-[#4285F4] rounded-full p-1 m-1 shadow-md z-10">
                                                            <svg className="w-4 h-4 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {/* 確認ボタン */}
                                        <div className="flex justify-end mt-2">
                                            <button
                                                onClick={handleVerify}
                                                className="bg-[#4285F4] hover:bg-[#3367D6] text-white font-bold py-2 px-6 rounded text-sm uppercase tracking-wide transition shadow-sm active:shadow-inner"
                                            >
                                                確認
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* 相手のセクション */}
                                <div className="w-full md:w-auto md:h-full flex flex-col justify-center items-center shrink-0">
                                    <h3 className="text-xl md:text-2xl font-bold text-gray-700 mb-2">相手</h3>
                                    <div className="bg-gray-100 rounded-sm p-2 flex flex-col items-center shadow-inner md:w-48 border border-gray-300">
                                        <div className="flex items-center gap-2 mb-2 w-full justify-center">
                                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                            <p className="text-xs font-bold text-gray-500">RIVAL VIEW</p>
                                        </div>
                                        <div className="grid grid-cols-3 gap-0.5 w-32 md:w-full opacity-90">
                                            {images.map((img: string, idx: number) => (
                                                <div
                                                    key={`opp-${idx}`}
                                                    className="relative aspect-square overflow-hidden bg-gray-300"
                                                >
                                                    <div className={`w-full h-full transition-transform duration-100 ${opponentSelections.includes(idx) ? 'scale-75' : ''}`}>
                                                        <img src={img} className="w-full h-full object-cover" />
                                                    </div>
                                                    {opponentSelections.includes(idx) && (
                                                        <div className="absolute top-0 left-0 bg-[#4285F4] rounded-full p-0.5 m-0.5 z-10">
                                                            <svg className="w-2 h-2 md:w-3 md:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
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