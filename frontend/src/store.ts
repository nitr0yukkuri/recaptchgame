import { create } from 'zustand';

export type GameState = 'LOGIN' | 'WAITING' | 'PLAYING' | 'RESULT';
export type FeedbackType = 'CORRECT' | 'WRONG' | null;

interface Store {
    gameState: GameState;
    roomId: string;
    playerId: string;
    target: string;
    images: string[];
    // 追加: CPUモード用の独立した問題データ
    cpuTarget: string;
    cpuImages: string[];

    opponentScore: number;
    opponentSelections: number[];
    mySelections: number[];
    winner: string | null;
    feedback: FeedbackType;
    setGameState: (state: GameState) => void;
    setRoomInfo: (roomId: string, playerId: string) => void;
    startGame: (target: string, images: string[]) => void;
    updatePattern: (target: string, images: string[]) => void;

    // 追加: 個別に問題を更新するアクション
    updateCpuPattern: (target: string, images: string[]) => void;
    updatePlayerPattern: (target: string, images: string[]) => void;

    updateOpponentScore: (score: number) => void;
    toggleOpponentSelection: (index: number) => void;
    resetOpponentSelections: () => void;
    toggleMySelection: (index: number) => void;
    resetMySelections: () => void;
    endGame: (winner: string) => void;
    setFeedback: (feedback: FeedbackType) => void;
}

export const useGameStore = create<Store>((set) => ({
    gameState: 'LOGIN',
    roomId: '',
    playerId: `p_${Math.floor(Math.random() * 1000)}`,
    target: '',
    images: [],
    cpuTarget: '',
    cpuImages: [],
    opponentScore: 0,
    opponentSelections: [],
    mySelections: [],
    winner: null,
    feedback: null,
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
        feedback: null
    }),
    // オンライン用（両方の選択をリセット）
    updatePattern: (target, images) => set({ target, images, opponentSelections: [], mySelections: [] }),

    // CPU用更新：CPUのターゲットと画像を更新し、CPUの選択のみリセット
    updateCpuPattern: (target, images) => set({ cpuTarget: target, cpuImages: images, opponentSelections: [] }),

    // プレイヤー用更新（CPUモード）：自分のターゲットと画像を更新し、自分の選択のみリセット（相手の進行は邪魔しない）
    updatePlayerPattern: (target, images) => set({ target, images, mySelections: [] }),

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
    setFeedback: (feedback) => set({ feedback }),
}));