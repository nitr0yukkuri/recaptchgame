/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'cyber-bg': '#09090b',      // ほぼ黒
                'cyber-card': '#18181b',    // ダークグレー
                'cyber-primary': '#00ff9d', // ネオングリーン
                'cyber-secondary': '#27272a', // ボーダー用グレー
                'cyber-text': '#e4e4e7',    // 白に近いグレー
                'cyber-muted': '#a1a1aa',   // 薄いグレー
            },
            fontFamily: {
                mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', "Liberation Mono", "Courier New", 'monospace'],
            }
        },
    },
    plugins: [],
}