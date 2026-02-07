import * as Tone from 'tone';
import { useEffect, useRef } from 'react';

export const useSound = () => {
    const synthRef = useRef<Tone.PolySynth | null>(null);

    useEffect(() => {
        // ビットクラッシャーで少しレトロ・劣化感を出す（Windowsエラー音風）
        const crusher = new Tone.BitCrusher(4).toDestination();

        const synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: "sawtooth", // ノコギリ波で警告音っぽく
            },
            envelope: {
                attack: 0.01,
                decay: 0.1,
                sustain: 0,
                release: 0.1,
            }
        }).connect(crusher);

        synth.volume.value = -5;
        synthRef.current = synth;

        return () => {
            synth.dispose();
        };
    }, []);

    // 🔴 ボタンクリックでこれを呼ぶ（オーディオコンテキスト起動）
    const initAudio = async () => {
        await Tone.start();
        console.log("Audio Context Started");
    };

    // 🔊 不正解音（デデン！）
    const playError = () => {
        if (synthRef.current) {
            const now = Tone.now();
            synthRef.current.triggerAttackRelease(["C2", "F#2"], "16n", now);
            synthRef.current.triggerAttackRelease(["C2", "F#2"], "8n", now + 0.1);
        }
    };

    // 🔊 正解音（ピンポン！）
    const playSuccess = () => {
        if (synthRef.current) {
            const now = Tone.now();
            // Cメジャーアルペジオで明るく「テレリン！」（正解感を強化）
            synthRef.current.triggerAttackRelease("C5", "32n", now);
            synthRef.current.triggerAttackRelease("E5", "32n", now + 0.05);
            synthRef.current.triggerAttackRelease("G5", "8n", now + 0.1);
        }
    };

    // 🔊 勝利音（ファンファーレ）
    const playWin = () => {
        if (synthRef.current) {
            const now = Tone.now();
            // 明るい和音を駆け上がる
            synthRef.current.triggerAttackRelease(["C4", "E4", "G4"], "16n", now);
            synthRef.current.triggerAttackRelease(["E4", "G4", "C5"], "16n", now + 0.15);
            synthRef.current.triggerAttackRelease(["G4", "C5", "E5"], "2n", now + 0.3);
        }
    };

    // 🔊 敗北音（残念なディセント）
    const playLose = () => {
        if (synthRef.current) {
            const now = Tone.now();
            // 暗い和音を下がる
            synthRef.current.triggerAttackRelease(["G3", "B3"], "8n", now);
            synthRef.current.triggerAttackRelease(["F#3", "A#3"], "8n", now + 0.2);
            synthRef.current.triggerAttackRelease(["F3", "A3"], "2n", now + 0.4);
        }
    };

    // 🔊 妨害音（ランダムパターン）
    const playObstruction = () => {
        if (synthRef.current) {
            const now = Tone.now();
            const pattern = Math.floor(Math.random() * 3);

            switch (pattern) {
                case 0: // ノイズ
                    synthRef.current.triggerAttackRelease(["C2", "C#2"], "32n", now);
                    synthRef.current.triggerAttackRelease(["C2", "C#2"], "32n", now + 0.05);
                    break;
                case 1: // 不安な不協和音
                    synthRef.current.triggerAttackRelease(["F#4", "G4"], "8n", now);
                    break;
                case 2: // 下降音
                    synthRef.current.triggerAttackRelease(["A4"], "32n", now);
                    synthRef.current.triggerAttackRelease(["G#4"], "32n", now + 0.05);
                    synthRef.current.triggerAttackRelease(["G4"], "16n", now + 0.1);
                    break;
            }
        }
    };

    // 🔊 カウントダウン音（ピッ）[NEW]
    const playTick = () => {
        if (synthRef.current) {
            synthRef.current.triggerAttackRelease("E5", "32n", Tone.now());
        }
    };

    // 🔊 試合開始音（ピー！）
    const playStart = () => {
        if (synthRef.current) {
            const now = Tone.now();
            // ホイッスル風
            synthRef.current.triggerAttackRelease("C5", "4n", now);
            synthRef.current.triggerAttackRelease("E5", "4n", now);
        }
    };

    return { initAudio, playError, playSuccess, playWin, playLose, playObstruction, playStart, playTick };
};