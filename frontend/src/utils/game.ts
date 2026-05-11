import { ObstructionType } from '../store';

const SIGNAL_SPLIT_BASE_IMAGE = '/images/shingouki4.jpg';
// 中段（左, 中央, 右）を正解タイルに設定（3x3 グリッドでのインデックス）
const SIGNAL_SPLIT_CORRECT_TILES = [3, 4, 5];
// 消火器（新規ターゲット）用の分割ベース画像と正解タイル（中列上中下）
const EXTINGUISHER_SPLIT_BASE_IMAGE = '/images/shoukasen0.jpg';
const EXTINGUISHER_SPLIT_CORRECT_TILES = [1, 4, 7];

export const ALL_CPU_IMAGES = [
    '/images/car1.jpg', '/images/car2.jpg', '/images/car3.jpg', '/images/car4.jpg', '/images/car5.jpg',
    '/images/shingouki1.jpg', '/images/shingouki2.jpg', '/images/shingouki3.jpg', '/images/shingouki4.jpg',
    '/images/kaidan0.jpg', '/images/kaidan1.jpg', '/images/kaidan2.jpg',
    '/images/shoukasen0.jpg', '/images/shoukasen1.jpg', '/images/shoukasen2.jpg',
    '/images/tamanegi5.png',
];

export const ONION_IMAGE = '/images/tamanegi5.png';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const generateCpuProblem = (prevTarget?: string) => {
    const targets = ['車', '信号機', '階段', '消火栓', '消火器'];
    let newTarget = targets[Math.floor(Math.random() * targets.length)];

    if (prevTarget && targets.length > 1) {
        while (newTarget === prevTarget) {
            newTarget = targets[Math.floor(Math.random() * targets.length)];
        }
    }

    if (newTarget === '信号機') {
        return {
            target: newTarget,
            images: Array.from({ length: 9 }, (_, idx) => `${SIGNAL_SPLIT_BASE_IMAGE}#tile=${idx}`),
        };
    }
    if (newTarget === '消火器') {
        return {
            target: newTarget,
            images: Array.from({ length: 9 }, (_, idx) => `${EXTINGUISHER_SPLIT_BASE_IMAGE}#tile=${idx}`),
        };
    }

    let searchKey = '';
    if (newTarget === '車') searchKey = 'car';
    else if (newTarget === '階段') searchKey = 'kaidan';
    else if (newTarget === '消火栓') searchKey = 'shoukasen';

    const corrects = ALL_CPU_IMAGES.filter(img => img.toLowerCase().includes(searchKey));
    const others = ALL_CPU_IMAGES.filter(img => !img.toLowerCase().includes(searchKey));

    const shuffledCorrects = [...corrects].sort(() => Math.random() - 0.5);
    const shuffledOthers = [...others].sort(() => Math.random() - 0.5);

    const count = Math.min(3, shuffledCorrects.length);
    const selected = shuffledCorrects.slice(0, count);
    const remainingCandidates = [...shuffledOthers, ...shuffledCorrects.slice(count)].sort(() => Math.random() - 0.5);
    const finalImages = [...selected, ...remainingCandidates.slice(0, 9 - selected.length)];

    return {
        target: newTarget,
        images: finalImages.sort(() => Math.random() - 0.5)
    };
};

export const getCorrectIndices = (imgs: string[], tgt: string) => {
    if (tgt === '信号機') {
        return imgs
            .map((img, idx) => parseSplitTileIndex(img) && SIGNAL_SPLIT_CORRECT_TILES.includes(parseSplitTileIndex(img) as number) ? idx : -1)
            .filter(idx => idx !== -1);
    }
    if (tgt === '消火器') {
        return imgs
            .map((img, idx) => parseSplitTileIndex(img) && EXTINGUISHER_SPLIT_CORRECT_TILES.includes(parseSplitTileIndex(img) as number) ? idx : -1)
            .filter(idx => idx !== -1);
    }

    let searchKey = '';
    if (tgt === '車') searchKey = 'car';
    else if (tgt === '信号機') searchKey = 'shingouki';
    else if (tgt === '階段') searchKey = 'kaidan';
    else if (tgt === '消火栓') searchKey = 'shoukasen';
    else if (tgt === 'TRAFFIC LIGHT') searchKey = 'shingouki';
    else searchKey = tgt.toLowerCase();

    return imgs
        .map((img, idx) => img.toLowerCase().includes(searchKey) ? idx : -1)
        .filter(idx => idx !== -1);
};

export const parseSplitTileIndex = (img: string) => {
    const match = img.match(/#tile=(\d+)$/);
    return match ? Number(match[1]) : null;
};
export const getRandomObstruction = (): ObstructionType => {
    const effects: ObstructionType[] = ['SHAKE', 'SPIN', 'BLUR', 'INVERT', 'ONION_RAIN', 'GRAYSCALE', 'SEPIA', 'SKEW'];
    return effects[Math.floor(Math.random() * effects.length)];
};
