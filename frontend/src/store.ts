import { create } from 'zustand';

export type GameState = 'LOGIN' | 'WAITING' | 'PLAYING' | 'RESULT';

interface Store {
    gameState: GameState;
    roomId: string;
    playerId: string;
    target: string;
    images: string[];
    opponentScore: number;
    winner: string | null;
    setGameState: (state: GameState) => void;
    setRoomInfo: (roomId: string, playerId: string) => void;
    startGame: (target: string, images: string[]) => void;
    updatePattern: (target: string, images: string[]) => void; // 追加
    updateOpponentScore: (score: number) => void;
    endGame: (winner: string) => void;
}

export const useGameStore = create<Store>((set) => ({
    gameState: 'LOGIN',
    roomId: '',
    playerId: `p_${Math.floor(Math.random() * 1000)}`,
    target: '',
    images: [],
    opponentScore: 0,
    winner: null,
    setGameState: (state) => set({ gameState: state }),
    setRoomInfo: (roomId, playerId) => set({ roomId, playerId }),
    startGame: (target, images) => set({ gameState: 'PLAYING', target, images, opponentScore: 0, winner: null }),
    updatePattern: (target, images) => set({ target, images }), // スコアをリセットしない
    updateOpponentScore: (score) => set({ opponentScore: score }),
    endGame: (winner) => set({ gameState: 'RESULT', winner }),
}));