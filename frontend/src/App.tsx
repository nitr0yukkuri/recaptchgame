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
        <div className="min-h-screen bg-cyber-bg text-cyber-text font-mono flex items-center justify-center p-4">
            <div className="bg-cyber-card border border-cyber-secondary p-1 rounded-sm shadow-[0_0_20px_rgba(0,0,0,0.5)] max-w-lg w-full relative">

                {/* Decoration Lines */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyber-primary"></div>
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyber-primary"></div>
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyber-primary"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyber-primary"></div>

                <div className="bg-cyber-secondary/30 border-b border-cyber-primary/20 p-5 mb-6 flex justify-between items-center backdrop-blur-sm">
                    <div>
                        <p className="text-[10px] text-cyber-primary tracking-widest mb-1 opacity-80">SYSTEM: RECAPTCHA_PROTOCOL_V3</p>
                        <h1 className="text-xl font-bold tracking-tighter text-white">
                            <span className="text-cyber-primary mr-2">PROVE</span>
                            YOU ARE HUMAN
                        </h1>
                    </div>
                    <div className="flex flex-col items-center justify-center border border-cyber-primary/30 rounded p-1">
                        <div className="w-8 h-8 border-2 border-cyber-primary rounded-full flex items-center justify-center animate-pulse">
                            <div className="w-4 h-4 bg-cyber-primary rounded-sm"></div>
                        </div>
                    </div>
                </div>

                <div className="p-4">
                    {gameState === 'LOGIN' && (
                        <div className="space-y-8">
                            <div className="border-l-2 border-cyber-primary pl-4 py-2 bg-cyber-primary/5">
                                <h2 className="text-lg font-bold text-cyber-primary mb-2">MISSION OBJECTIVE</h2>
                                <ul className="text-xs space-y-2 text-cyber-muted">
                                    <li className="flex items-center"><span className="w-1 h-1 bg-cyber-primary mr-2"></span>IDENTIFY TARGET IMAGES</li>
                                    <li className="flex items-center"><span className="w-1 h-1 bg-cyber-primary mr-2"></span>OUTPERFORM OPPONENT SPEED</li>
                                    <li className="flex items-center"><span className="w-1 h-1 bg-cyber-primary mr-2"></span>AVOID BOT DETECTION</li>
                                </ul>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs text-cyber-muted mb-1 block">ACCESS CODE (ROOM ID)</label>
                                    <input
                                        type="text" value={inputRoom} onChange={(e) => setInputRoom(e.target.value)}
                                        placeholder="ENTER_ID..."
                                        className="w-full bg-black/30 border border-cyber-secondary p-3 text-cyber-primary focus:border-cyber-primary focus:shadow-[0_0_10px_rgba(0,255,157,0.2)] outline-none transition-all placeholder-cyber-secondary"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <button onClick={() => joinRoom('PVP')} className="group relative bg-cyber-primary/10 border border-cyber-primary text-cyber-primary py-3 font-bold hover:bg-cyber-primary hover:text-black transition-all duration-300 overflow-hidden">
                                        <span className="relative z-10">INITIATE PVP {'>>'}</span>
                                        <div className="absolute inset-0 bg-cyber-primary/20 transform -skew-x-12 translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
                                    </button>
                                    <button onClick={() => joinRoom('CPU')} className="group border border-cyber-secondary text-cyber-muted py-3 font-bold hover:border-cyber-text hover:text-cyber-text transition-all bg-transparent">
                                        <span>TRAINING MODE</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {gameState === 'WAITING' && (
                        <div className="text-center py-16 relative">
                            <div className="absolute inset-0 flex items-center justify-center opacity-10">
                                <div className="w-32 h-32 border border-cyber-primary rounded-full animate-ping"></div>
                            </div>
                            <div className="w-12 h-12 border-t-2 border-l-2 border-cyber-primary rounded-full mx-auto mb-6 animate-spin"></div>
                            <p className="font-bold text-lg text-cyber-primary tracking-widest animate-pulse">SCANNING NETWORK...</p>
                            <p className="text-xs text-cyber-muted mt-4 font-mono">ROOM_ID: <span className="text-white">{roomId}</span></p>
                        </div>
                    )}

                    {gameState === 'PLAYING' && (
                        <div>
                            <div className="bg-cyber-primary/10 border border-cyber-primary/30 p-4 mb-4 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-1">
                                    <div className="flex space-x-1">
                                        <div className="w-1 h-1 bg-cyber-primary"></div>
                                        <div className="w-1 h-1 bg-cyber-primary"></div>
                                        <div className="w-1 h-1 bg-cyber-primary"></div>
                                    </div>
                                </div>
                                <p className="text-[10px] text-cyber-primary mb-1">TARGET IDENTIFICATION</p>
                                <h2 className="text-2xl font-bold uppercase tracking-wider text-white drop-shadow-[0_0_5px_rgba(0,255,157,0.5)]">{target}</h2>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mb-6 p-1 bg-black/20 border border-cyber-secondary">
                                {images.map((img, idx) => (
                                    <motion.div
                                        key={idx}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleImageClick(idx)}
                                        className="relative aspect-square cursor-pointer overflow-hidden border border-cyber-secondary/50 hover:border-cyber-primary transition-colors group"
                                    >
                                        <div className="absolute inset-0 bg-cyber-primary/0 group-hover:bg-cyber-primary/10 transition-colors z-10"></div>
                                        <img src={img} className="w-full h-full object-cover filter sepia-[0.5] hue-rotate-[130deg] contrast-125 group-hover:filter-none transition-all duration-300" alt="captcha" />
                                        <div className="absolute bottom-1 right-1 text-[8px] text-cyber-primary bg-black/50 px-1 opacity-0 group-hover:opacity-100">SEL</div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between text-xs font-bold text-cyber-muted uppercase tracking-wider">
                                    <span className="flex items-center"><span className="w-2 h-2 bg-cyber-primary rounded-full mr-2 animate-pulse"></span>YOU: {isCpuMode ? useGameStore.getState().score : '...'} / 5</span>
                                    <span className="flex items-center text-red-400">{isCpuMode ? 'CPU' : 'RIVAL'}: {opponentScore} / 5<span className="w-2 h-2 bg-red-500 rounded-full ml-2"></span></span>
                                </div>
                                <div className="w-full h-2 bg-black/50 border border-cyber-secondary/30 flex relative">
                                    <div className="absolute inset-0 flex justify-between px-1">
                                        {[...Array(9)].map((_, i) => <div key={i} className="w-px h-full bg-cyber-secondary/20"></div>)}
                                    </div>
                                    <div className="h-full bg-cyber-primary shadow-[0_0_10px_rgba(0,255,157,0.5)] transition-all duration-300 relative z-10" style={{ width: `${(useGameStore.getState().score / 5) * 50}%` }}></div>
                                    <div className="h-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)] transition-all duration-300 relative z-10" style={{ width: `${(opponentScore / 5) * 50}%` }}></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {gameState === 'RESULT' && (
                        <div className="text-center py-12 relative overflow-hidden">
                            {winner === playerId ? (
                                <div className="text-cyber-primary relative z-10">
                                    <div className="inline-block border-2 border-cyber-primary rounded-full p-4 mb-4 shadow-[0_0_20px_rgba(0,255,157,0.3)]">
                                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <h2 className="text-3xl font-bold italic tracking-tighter mb-2 text-white">ACCESS GRANTED</h2>
                                    <p className="text-sm font-mono text-cyber-primary/80">HUMAN VERIFICATION COMPLETE</p>
                                </div>
                            ) : (
                                <div className="text-red-500 relative z-10">
                                    <div className="inline-block border-2 border-red-500 rounded-full p-4 mb-4 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </div>
                                    <h2 className="text-3xl font-bold italic tracking-tighter mb-2 text-white">ACCESS DENIED</h2>
                                    <p className="text-sm font-mono text-red-400">BOT ACTIVITY DETECTED</p>
                                </div>
                            )}

                            <div className="absolute inset-0 bg-[url('https://media.giphy.com/media/U3qYN8SMQZsTFJu8M/giphy.gif')] opacity-5 mix-blend-screen pointer-events-none"></div>

                            <button onClick={() => window.location.reload()} className="mt-10 bg-cyber-primary text-black px-8 py-3 font-bold hover:bg-white transition shadow-[0_0_15px_rgba(0,255,157,0.4)] relative z-20">
                                REBOOT SYSTEM
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer Status */}
                <div className="bg-black/40 p-2 flex justify-between text-[10px] text-cyber-secondary font-mono border-t border-cyber-secondary/20">
                    <span>SECURE CONNECTION</span>
                    <span>LATENCY: 12ms</span>
                </div>
            </div>
        </div>
    );
}

export default App;