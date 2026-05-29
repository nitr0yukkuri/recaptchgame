/// <reference types="vite/client" />
import { useEffect, useState } from 'react';
import { useGameController } from './hooks/useGameController';
import useWebSocket from 'react-use-websocket';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from './store';
import { useSound } from './useSound';

import { useObstructionEffect } from './hooks/useObstructionEffect';
import { useCpuGame } from './hooks/useCpuGame';
import { useOnlineGame } from './hooks/useOnlineGame';

import { LoginScreen } from './components/LoginScreen.tsx';
import { WaitingScreen } from './components/WaitingScreen';
import { GameScreen } from './components/GameScreen';
import { BRGameScreen } from './components/BRGameScreen';
import { ResultScreen } from './components/ResultScreen';
import InviteQrModal from './components/InviteQrModal.tsx';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
const STATIC_WS_OPTIONS = {
    onOpen: () => console.log('Connected to Server'),
    shouldReconnect: () => true,
};

const ROOM_ID_PATTERN = /^[A-Za-z0-9]{6}$/;

const SESSION_STORAGE_KEY = 'recaptcha_game_session_id';

function getOrCreateSessionID(): string {
    if (typeof window === 'undefined') return 'session_server';
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
}

function App() {
    // ── グローバルストア（表示に必要なもののみ）──────────────
    const { gameState, roomId, playerId, playerEffect, opponentEffect, feedback } = useGameStore();

    // ── ローカル UI 状態 ────────────────────────────────────
    const [gameMode, setGameMode] = useState<'CPU' | 'ONLINE' | null>(null);
    const [isRandomMatch, setIsRandomMatch] = useState(false);
    const [loginStep, setLoginStep] = useState<'SELECT' | 'FRIEND' | 'FRIEND_INPUT' | 'WAITING' | 'DIFFICULTY' | 'CPU_PLAYER_COUNT'>('SELECT');
    const [myScore, setMyScore] = useState(0);
    const [winningScore, setWinningScore] = useState(5);
    const [inputRoom, setInputRoom] = useState('');
    const [loginError, setLoginError] = useState('');
    const [roomCapacity, setRoomCapacity] = useState<number>(2);
    const [sessionID] = useState(getOrCreateSessionID());

    // ── サウンド・WebSocket ──────────────────────────────────
    const { initAudio, playError, playSuccess, playWin, playLose, playObstruction, playStart } = useSound();
    const { sendMessage, lastMessage, readyState } = useWebSocket(WS_URL, STATIC_WS_OPTIONS);
    const [roomStatusInfo, setRoomStatusInfo] = useState<{ capacity?: number; players?: string[] } | null>(null);

    // ── 妨害エフェクト管理 ──────────────────────────────────
    const { brAttackEffect, fireBRObstruction, showBRAttack } = useObstructionEffect({ playObstruction });

    // ── CPU ゲームロジック ───────────────────────────────────
    const {
        settingScore, setSettingScore,
        cpuPlayerCount, setCpuPlayerCount,
        isReloading,
        confirmDifficulty,
        handleReload,
        handleVerifyCpu,
    } = useCpuGame({ gameMode, setMyScore, setWinningScore, fireBRObstruction, showBRAttack, playSuccess, playError, playLose, playStart });

    const showOpponentAttackBanner = !(gameMode === 'CPU' && cpuPlayerCount === 1);

    // ── オンラインゲームロジック ─────────────────────────────
    const {
        isVerifying, setIsVerifying,
        startPopup, startMessage,
        isCreator, setIsCreator,
        handleVerifyOnline,
        stopMatching,
    } = useOnlineGame({ sendMessage, lastMessage, setGameMode, setMyScore, setWinningScore, playSuccess, playError, playWin, playLose, playStart, onObstructionFired: showBRAttack });

    const [showInviteModal, setShowInviteModal] = useState(false);

    const [notice, setNotice] = useState<string | null>(null);

    // ── ゲームアクション（モード共通の接続点）────────────────
    const handleImageClick = (index: number) => {
        if (isReloading || isVerifying) return;
        useGameStore.getState().toggleMySelection(index);
        if (gameMode === 'ONLINE') {
            sendMessage(JSON.stringify({
                type: 'SELECT_IMAGE',
                payload: { room_id: roomId, player_id: playerId, image_index: index },
            }));
        }
    };

    const controller = useGameController();
    const handleVerify = () => {
        if (isReloading || isVerifying) return;
        const selections = useGameStore.getState().mySelections;
        if (!selections || selections.length === 0) {
            setNotice('画像を選んでね');
            controller.scheduleNoticeHide(sessionID, () => setNotice(null), 1400);
            return;
        }

        if (gameMode === 'CPU') {
            handleVerifyCpu(winningScore);
        } else {
            handleVerifyOnline();
        }
    };

    // ── 勝敗判定（CPU複数プレイヤー & 共通 myScore 監視）──────
    // useEffect 内で勝敗判定を実行（レンダリングサイクル違反を防止）
    useEffect(() => {
        if (gameMode !== 'CPU' || gameState !== 'PLAYING') return;

        // 自分の勝利条件
        if (myScore >= winningScore) {
            playWin();
            useGameStore.getState().endGame('human');
            return;
        }

        // 複数プレイヤーの場合、他のプレイヤーの勝利条件
        if (cpuPlayerCount > 1) {
            const cpuWinner = useGameStore.getState().brOpponents.find(opp => opp.score >= winningScore);
            if (cpuWinner) {
                playLose();
                useGameStore.getState().endGame(cpuWinner.id);
            }
        }
    }, [gameMode, gameState, myScore, cpuPlayerCount, winningScore, playWin, playLose]);

    // ── ログインフロー ───────────────────────────────────────
    const startCpuFlow = () => {
        initAudio();
        setSettingScore(5);
        setLoginStep('CPU_PLAYER_COUNT');
    };

    const confirmPlayerCount = (count: 1 | 3 | 4) => {
        setCpuPlayerCount(count);
        setLoginStep('DIFFICULTY');
    };

    const onConfirmDifficulty = (level: number) => {
        setGameMode('CPU');
        setMyScore(0);
        confirmDifficulty(level);
    };

    const joinRandom = () => {
        initAudio();
        setIsRandomMatch(true);
        setGameMode('ONLINE');
        sendMessage(JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { room_id: 'RANDOM', player_id: playerId, winning_score: 5, session_id: sessionID },
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
        setIsRandomMatch(false);
        setLoginStep('FRIEND_INPUT');
    };

    const enterRoomFlow = () => {
        setIsCreator(false);
        setLoginError('');
        setIsRandomMatch(false);
        setLoginStep('FRIEND_INPUT');
    };

    const joinRoomInternal = (room: string) => {
        if (!room) { setLoginError('IDを入力してね'); return; }
        if (!ROOM_ID_PATTERN.test(room)) { setLoginError('6文字の英数字で入力してね'); return; }
        setGameMode('ONLINE');
        useGameStore.getState().setRoomInfo(room, playerId);
        // If creator, include chosen capacity in payload
        if (isCreator) {
            sendMessage(JSON.stringify({
                type: 'JOIN_ROOM',
                payload: { room_id: room, player_id: playerId, winning_score: settingScore, session_id: sessionID, capacity: roomCapacity },
            }));
        } else {
            sendMessage(JSON.stringify({
                type: 'JOIN_ROOM',
                payload: { room_id: room, player_id: playerId, winning_score: settingScore, session_id: sessionID },
            }));
        }
    };

    // WebSocket再接続時に同一セッションで復帰を試みる
    useEffect(() => {
        if (readyState !== 1) return;
        if (gameMode !== 'ONLINE') return;
        if (!roomId || !playerId) return;

        sendMessage(JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { room_id: roomId, player_id: playerId, winning_score: winningScore, session_id: sessionID },
        }));
    }, [readyState]);

    // ResultScreen の「もう一度プレイ」用ハンドラをグローバルに設定
    useEffect(() => {
        // attach a minimal handler so ResultScreen can trigger replay without reload
        (window as any).__onReplay = () => {
            // If the last run was online (random match), rejoin random
            if (isRandomMatch || gameMode === 'ONLINE') {
                // reuse existing joinRandom logic
                joinRandom();
            } else {
                // fallback: reload the page
                window.location.reload();
            }
        };
        return () => { delete (window as any).__onReplay; };
    }, [isRandomMatch, gameMode, playerId, sessionID]);

    // WS受信から部屋の参加人数・定員情報を抽出して表示用に保持（バックエンドに変更は加えない）
    useEffect(() => {
        if (!lastMessage) return;
        // プライベートマッチ以外（ランダムマッチ）のときは表示しない
        if (isRandomMatch) return;
        try {
            const msg = JSON.parse(lastMessage.data as string);
            // payload が { room: { capacity, players: [...] } } の形式で来る場合に対応
            const payload = msg.payload || {};
            const roomObj = payload.room || payload;
            if (roomObj && (roomObj.capacity !== undefined || roomObj.players !== undefined)) {
                const players = Array.isArray(roomObj.players)
                    ? roomObj.players.map((p: any) => p.name || p.player_id || p.id || String(p))
                    : undefined;
                setRoomStatusInfo({ capacity: roomObj.capacity, players });
            }
        } catch (e) {
            // ignore parse errors
        }
    }, [lastMessage, isRandomMatch]);

    const leaveRoom = () => {
        stopMatching();
        setIsVerifying(false);
        if (gameMode === 'ONLINE' || (roomId && roomId !== 'LOCAL_CPU')) {
            sendMessage(JSON.stringify({
                type: 'LEAVE_ROOM',
                payload: { room_id: roomId, player_id: playerId },
            }));
        }
        useGameStore.getState().setGameState('LOGIN');
        setGameMode(null);
        setMyScore(0);
        setCpuPlayerCount(0);
    };

    const cancelWaiting = () => {
        leaveRoom();
        setLoginStep(prev => prev === 'SELECT' ? 'SELECT' : 'FRIEND');
        setInputRoom('');
        setLoginError('');
    };

    const goHome = () => {
        leaveRoom();
        setLoginStep('SELECT');
        setInputRoom('');
        setLoginError('');
    };

    useEffect(() => {
        if (gameState !== 'LOGIN') return;
        if (typeof window === 'undefined') return;

        const room = new URLSearchParams(window.location.search).get('room');
        if (!room || !ROOM_ID_PATTERN.test(room)) return;

        setIsCreator(false);
        setIsRandomMatch(false);
        setLoginStep('FRIEND_INPUT');
        setInputRoom(room);
        setLoginError('');
    }, [gameState]);

    // URLにroomクエリがあれば自動で参加画面（FRIEND_INPUT）に進む処理は上の useEffect で行われるため、
    // ここで即座に joinRoomInternal を呼ぶ処理（自動マッチング）は削除しました。

    // 招待QRの表示: ルーム作成者で roomId がセットされたら表示する
    useEffect(() => {
        if (roomId && isCreator) {
            setShowInviteModal(true);
        }
    }, [roomId, isCreator]);

    // ── JSX ─────────────────────────────────────────────────
    return (
        <div className="h-screen w-screen bg-white flex flex-col items-center font-sans text-gray-800 overflow-hidden relative">

            {/* 妨害バナー群 */}
            <AnimatePresence>
                {playerEffect && (
                    <motion.div key="player-effect"
                        initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
                        className="fixed top-24 left-0 right-0 z-[60] flex justify-center pointer-events-none"
                    >
                        <div className="bg-red-500 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-red-200">
                            ⚔️ 攻撃中: {playerEffect}
                        </div>
                    </motion.div>
                )}
                {showOpponentAttackBanner && opponentEffect && (
                    <motion.div key="opponent-effect"
                        initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
                        className="fixed top-36 left-0 right-0 z-[60] flex justify-center pointer-events-none"
                    >
                        <div className="bg-blue-500 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-blue-200">
                            ⚔️ 攻撃中: {opponentEffect}
                        </div>
                    </motion.div>
                )}
                {brAttackEffect && (
                    <motion.div key="br-attack-effect"
                        initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
                        className="fixed top-48 left-0 right-0 z-[60] flex justify-center pointer-events-none"
                    >
                        <div className="bg-amber-500 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-amber-200">
                            ⚔️ 攻撃中: {brAttackEffect}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 選択促し（黄色テキスト風の小さなバナー） */}
            <AnimatePresence>
                {notice && (
                    <motion.div
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 2 }} exit={{ opacity: 0, y: -6 }}
                        className="fixed top-44 left-0 right-0 z-[75] flex justify-center pointer-events-none"
                    >
                        <div className="px-2 py-1 text-yellow-500 font-semibold">
                            {notice}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>



            {/* カウントダウン演出 */}
            <AnimatePresence>
                {startPopup && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.5 }}
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

            {showInviteModal && roomId && (
                <InviteQrModal roomId={roomId} onClose={() => setShowInviteModal(false)} />
            )}

            {/* 正誤フィードバック */}
            <AnimatePresence>
                {feedback && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                        className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none"
                    >
                        {feedback === 'CORRECT' ? (
                            <div className="bg-white/90 p-12 rounded-full shadow-2xl backdrop-blur-sm">
                                <svg className="w-40 h-40 text-green-500 translate-y-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            </div>
                        ) : (
                            <div className="bg-white/90 p-12 rounded-full shadow-2xl backdrop-blur-sm">
                                <svg className="w-40 h-40 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ホームボタン */}
            {(gameState !== 'LOGIN' || loginStep !== 'SELECT') && (
                <button onClick={goHome}
                    className="absolute top-2 left-2 z-[100] flex items-center gap-1 px-3 py-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition bg-white/80 backdrop-blur-sm shadow-sm cursor-pointer pointer-events-auto"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span className="hidden md:inline font-bold">ホーム</span>
                </button>
            )}

            <div className="w-full h-full max-w-4xl flex flex-col relative">
                <div className="flex flex-col items-center mt-2 sm:mt-6 md:mt-12 lg:mt-16 mb-0 shrink-0 z-40 pointer-events-none">
                    <h1 className="pointer-events-auto">
                        <img src="/images/recaptch_logo.png" alt="reCAPTCHA ゲーム" className="h-16 sm:h-24 md:h-36 lg:h-48 w-auto" />
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
                            confirmDifficulty={onConfirmDifficulty}
                            confirmPlayerCount={confirmPlayerCount}
                            cpuPlayerCount={cpuPlayerCount}
                            roomCapacity={roomCapacity}
                            setRoomCapacity={setRoomCapacity}
                        />
                    )}

                    {gameState === 'WAITING' && (
                        <WaitingScreen roomId={roomId} isRandomMatch={isRandomMatch} cancelWaiting={cancelWaiting} roomStatusInfo={roomStatusInfo} />
                    )}

                    {gameState === 'PLAYING' && (cpuPlayerCount === 1 || gameMode === 'ONLINE') && (
                        <GameScreen
                            myScore={myScore}
                            winningScore={winningScore}
                            gameMode={gameMode}
                            isReloading={isReloading}
                            isVerifying={isVerifying || startPopup}
                            handleImageClick={handleImageClick}
                            handleReload={handleReload}
                            handleVerify={handleVerify}
                        />
                    )}

                    {gameState === 'PLAYING' && gameMode === 'CPU' && cpuPlayerCount > 1 && (
                        <BRGameScreen
                            myScore={myScore}
                            winningScore={winningScore}
                            isReloading={isReloading}
                            isVerifying={isVerifying}
                            handleImageClick={handleImageClick}
                            handleReload={handleReload}
                            handleVerify={handleVerify}
                            fireBRObstruction={fireBRObstruction}
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