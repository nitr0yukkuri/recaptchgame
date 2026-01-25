/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'google-blue': '#4285F4',
                'google-gray': '#F1F3F4',
            }
        },
    },
    plugins: [],
}