import { create } from 'zustand';

export type GameState = 'LOGIN' | 'WAITING' | 'PLAYING' | 'RESULT';
export type FeedbackType = 'CORRECT' | 'WRONG' | null;
// 妨害要素に GRAYSCALE, SEPIA, SKEW を追加
export type ObstructionType = 'SHAKE' | 'SPIN' | 'BLUR' | 'INVERT' | 'ONION_RAIN' | 'GRAYSCALE' | 'SEPIA' | 'SKEW' | null;

// バトロワ対戦相手の型
export type BROpponent = {
    id: string;
    score: number;
    combo: number;
    effect: ObstructionType;
    selections: number[];
    images: string[];
    target: string;  // 現在の出題ターゲット（getCorrectIndices に渡す）
};

interface Store {
    gameState: GameState;
    roomId: string;
    playerId: string;
    target: string;
    images: string[];
    cpuTarget: string;
    cpuImages: string[];
    // 追加: CPU難易度 (1: よわい, 2: ふつう, 3: つよい)
    cpuDifficulty: number;

    opponentScore: number;
    opponentSelections: number[];
    mySelections: number[];
    winner: string | null;
    disconnected: boolean; // 相手が切断したかどうか
    feedback: FeedbackType;

    playerCombo: number;
    opponentCombo: number;
    playerEffect: ObstructionType;
    opponentEffect: ObstructionType;

    // バトロワ専用ステート
    brOpponents: BROpponent[];
    setBROpponents: (opponents: BROpponent[]) => void;
    setBROpponentEffect: (id: string, effect: ObstructionType) => void;

    setGameState: (state: GameState) => void;
    setRoomInfo: (roomId: string, playerId: string) => void;
    startGame: (target: string, images: string[]) => void;
    updatePattern: (target: string, images: string[]) => void;

    updateCpuPattern: (target: string, images: string[]) => void;
    updatePlayerPattern: (target: string, images: string[]) => void;

    // 追加: 難易度設定用アクション
    setCpuDifficulty: (level: number) => void;

    updateOpponentScore: (score: number) => void;
    toggleOpponentSelection: (index: number) => void;
    resetOpponentSelections: () => void;
    toggleMySelection: (index: number) => void;
    resetMySelections: () => void;
    endGame: (winner: string, disconnected?: boolean) => void;
    setFeedback: (feedback: FeedbackType) => void;

    setPlayerCombo: (count: number) => void;
    setOpponentCombo: (count: number) => void;
    setPlayerEffect: (effect: ObstructionType) => void;
    setOpponentEffect: (effect: ObstructionType) => void;
}

export const useGameStore = create<Store>((set) => ({
    gameState: 'LOGIN',
    roomId: '',
    playerId: `p_${Math.floor(Math.random() * 1000)}`,
    target: '',
    images: [],
    cpuTarget: '',
    cpuImages: [],
    cpuDifficulty: 2, // デフォルトはふつう

    opponentScore: 0,
    opponentSelections: [],
    mySelections: [],
    winner: null,
    disconnected: false,
    feedback: null,

    playerCombo: 0,
    opponentCombo: 0,
    playerEffect: null,
    opponentEffect: null,

    brOpponents: [],
    setBROpponents: (opponents) => set({ brOpponents: opponents }),
    setBROpponentEffect: (id, effect) => set((state) => ({
        brOpponents: state.brOpponents.map(opp => opp.id === id ? { ...opp, effect } : opp),
    })),

    setGameState: (state) => set({ gameState: state }),
    setRoomInfo: (roomId, playerId) => set({ roomId, playerId }),
    startGame: (target, images) => set({
        gameState: 'PLAYING',
        target,
        images,
        opponentScore: 0,
        opponentSelections: [],
        mySelections: [],
        winner: null,
        disconnected: false,
        feedback: null,
        playerCombo: 0,
        opponentCombo: 0,
        playerEffect: null,
        opponentEffect: null,
    }),
    updatePattern: (target, images) => set({ target, images, opponentSelections: [], mySelections: [] }),
    updateCpuPattern: (target, images) => set({ cpuTarget: target, cpuImages: images, opponentSelections: [] }),
    updatePlayerPattern: (target, images) => set({ target, images, mySelections: [] }),

    setCpuDifficulty: (level) => set({ cpuDifficulty: level }),

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
    endGame: (winner, disconnected = false) => set({ gameState: 'RESULT', winner, disconnected }),
    setFeedback: (feedback) => set({ feedback }),

    setPlayerCombo: (count) => set({ playerCombo: count }),
    setOpponentCombo: (count) => set({ opponentCombo: count }),
    setPlayerEffect: (effect) => set({ playerEffect: effect }),
    setOpponentEffect: (effect) => set({ opponentEffect: effect }),
}));