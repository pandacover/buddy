/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        buddy: {
          bg: "#0f1115",
          panel: "#171a21",
          line: "#2a3140",
          accent: "#7c5cff",
          speak: "#3ee0a2",
          record: "#ff4d6d",
        },
      },
    },
  },
  plugins: [],
};
