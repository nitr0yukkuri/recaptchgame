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

    // 🔊 不正解音（デデン！）
    const playError = async () => {
        await Tone.start();
        if (synthRef.current) {
            const now = Tone.now();
            // 不協和音気味に低音を2回鳴らす
            synthRef.current.triggerAttackRelease(["C2", "F#2"], "16n", now);
            synthRef.current.triggerAttackRelease(["C2", "F#2"], "8n", now + 0.1);
        }
    };

    // 🔊 正解音（ピンポン！）
    const playSuccess = async () => {
        await Tone.start();
        if (synthRef.current) {
            const now = Tone.now();
            // 明るい高音
            synthRef.current.triggerAttackRelease("C5", "16n", now);
            synthRef.current.triggerAttackRelease("E5", "4n", now + 0.1);
        }
    };

    return { playError, playSuccess };
};