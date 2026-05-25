import { ObstructionType } from '../store';

const SIGNAL_SPLIT_BASE_IMAGE = '/images/shingouki4.jpg';
// 中段（左, 中央, 右）を正解タイルに設定（3x3 グリッドでのインデックス）
const SIGNAL_SPLIT_CORRECT_TILES = [3, 4, 5];

// バックエンドが送信する画像ID → フロントエンドの公開パスへの変換マップ
const IMAGE_ID_TO_PATH: Record<string, string> = {
    'car_1': '/images/car1.jpg',
    'car_2': '/images/car2.jpg',
    'car_3': '/images/car3.jpg',
    'car_4': '/images/car4.jpg',
    'car_5': '/images/car5.jpg',
    'shingouki_1': '/images/shingouki1.jpg',
    'shingouki_2': '/images/shingouki2.jpg',
    'shingouki_3': '/images/shingouki3.jpg',
    'shingouki_4': '/images/shingouki4.jpg',
    'kaidan_0': '/images/kaidan0.jpg',
    'kaidan_1': '/images/kaidan1.jpg',
    'kaidan_2': '/images/kaidan2.jpg',
    'shoukasen_0': '/images/shoukasen0.jpg',
    'shoukasen_1': '/images/shoukasen1.jpg',
    'shoukasen_2': '/images/shoukasen2.jpg',
    'tamanegu_5': '/images/tamanegi5.png',
};

/**
 * バックエンドから受け取った画像ID or フロント生成パスを、
 * レンダリング可能な src 文字列に変換する。
 * - バックエンドID (例: "car_1")         → "/images/car1.jpg"
 * - 分割タイルID (例: "shingouki_4#tile=2") → "/images/shingouki4.jpg#tile=2"
 * - 既にパス形式 (例: "/images/car1.jpg") → そのまま返す
 */
export const resolveImageSrc = (img: string): string => {
    // 分割タイル形式か確認
    const tileMatch = img.match(/^(.+)#tile=(\d+)$/);
    if (tileMatch) {
        const baseId = tileMatch[1];
        const tileNum = tileMatch[2];
        // baseId がIDなら変換、既にパスならそのまま
        const resolvedBase = IMAGE_ID_TO_PATH[baseId] ?? baseId;
        return `${resolvedBase}#tile=${tileNum}`;
    }
    // 通常ID or 既存パス
    return IMAGE_ID_TO_PATH[img] ?? img;
};

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
    const targets = ['車', '信号機', '階段', '消火栓'];
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
            .map((img, idx) => {
                const tile = parseSplitTileIndex(img);
                return (tile !== null && SIGNAL_SPLIT_CORRECT_TILES.includes(tile)) ? idx : -1;
            })
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
