/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 행성 타입 색상
        terra: '#4a90d9',      // 파란색
        desert: '#d4a84b',     // 노란색
        swamp: '#8b6b47',      // 갈색
        volcanic: '#c94444',   // 빨간색
        oxide: '#e67e22',      // 주황색
        titanium: '#7f8c8d',   // 회색
        ice: '#ecf0f1',        // 흰색
        gaia: '#27ae60',       // 녹색
        transdim: '#9b59b6',   // 보라색
        asteroids: '#2c3e50',  // 어두운 회색
      },
    },
  },
  plugins: [],
}
