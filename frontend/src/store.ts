import { create } from 'zustand';

export type GameState = 'LOGIN' | 'WAITING' | 'PLAYING' | 'RESULT';

interface Store {
    gameState: GameState;
    roomId: string;
    playerId: string;
    target: string;
    images: string[];
    score: number;
    opponentScore: number;
    winner: string | null;
    isCpuMode: boolean; // 追加
    setGameState: (state: GameState) => void;
    setRoomInfo: (roomId: string, playerId: string, isCpu?: boolean) => void; // 変更
    startGame: (target: string, images: string[]) => void;
    updateOpponentScore: (score: number) => void;
    endGame: (winner: string) => void;
}

export const useGameStore = create<Store>((set) => ({
    gameState: 'LOGIN',
    roomId: '',
    playerId: `player_${Math.floor(Math.random() * 10000)}`,
    target: '',
    images: [],
    score: 0,
    opponentScore: 0,
    winner: null,
    isCpuMode: false,
    setGameState: (state) => set({ gameState: state }),
    setRoomInfo: (roomId, playerId, isCpu = false) => set({ roomId, playerId, isCpuMode: isCpu }),
    startGame: (target, images) => set({ gameState: 'PLAYING', target, images, score: 0, opponentScore: 0 }),
    updateOpponentScore: (score) => set({ opponentScore: score }),
    endGame: (winner) => set({ gameState: 'RESULT', winner }),
}));