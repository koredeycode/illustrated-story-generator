/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF7F0",
        ink: "#292524",
        void: "#060609",
        panel: "#0e0e14",
        panel2: "#15151d",
        edge: "rgba(255,255,255,0.09)",
        accent: "#a78bfa",
        accent2: "#67e8f9",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
