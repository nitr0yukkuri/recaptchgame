import { create } from 'zustand';

export type GameState = 'LOGIN' | 'WAITING' | 'PLAYING' | 'RESULT';

interface Store {
    gameState: GameState;
    roomId: string;
    playerId: string;
    target: string;
    images: string[];
    opponentScore: number;
    opponentSelections: number[];
    mySelections: number[]; // 追加: 自分の選択
    winner: string | null;
    setGameState: (state: GameState) => void;
    setRoomInfo: (roomId: string, playerId: string) => void;
    startGame: (target: string, images: string[]) => void;
    updatePattern: (target: string, images: string[]) => void;
    updateOpponentScore: (score: number) => void;
    toggleOpponentSelection: (index: number) => void;
    resetOpponentSelections: () => void;
    toggleMySelection: (index: number) => void; // 追加
    resetMySelections: () => void; // 追加
    endGame: (winner: string) => void;
}

export const useGameStore = create<Store>((set) => ({
    gameState: 'LOGIN',
    roomId: '',
    playerId: `p_${Math.floor(Math.random() * 1000)}`,
    target: '',
    images: [],
    opponentScore: 0,
    opponentSelections: [],
    mySelections: [],
    winner: null,
    setGameState: (state) => set({ gameState: state }),
    setRoomInfo: (roomId, playerId) => set({ roomId, playerId }),
    startGame: (target, images) => set({
        gameState: 'PLAYING',
        target,
        images,
        opponentScore: 0,
        opponentSelections: [],
        mySelections: [],
        winner: null
    }),
    updatePattern: (target, images) => set({ target, images, opponentSelections: [], mySelections: [] }),
    updateOpponentScore: (score) => set({ opponentScore: score }),
    toggleOpponentSelection: (index) => set((state) => {
        const selections = state.opponentSelections.includes(index)
            ? state.opponentSelections.filter(i => i !== index)
            : [...state.opponentSelections, index];
        return { opponentSelections: selections };
    }),
    resetOpponentSelections: () => set({ opponentSelections: [] }),
    toggleMySelection: (index) => set((state) => {
        const selections = state.mySelections.includes(index)
            ? state.mySelections.filter(i => i !== index)
            : [...state.mySelections, index];
        return { mySelections: selections };
    }),
    resetMySelections: () => set({ mySelections: [] }),
    endGame: (winner) => set({ gameState: 'RESULT', winner }),
}));