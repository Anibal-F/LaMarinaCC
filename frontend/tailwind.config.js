/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#256e74",
        "background-light": "#f4f5f6",
        "background-dark": "#1a1f23",
        "surface-dark": "#2b3138",
        "border-dark": "#383f47",
        "alert-red": "#e04b4b",
        "alert-amber": "#f2a300",
        "alert-green": "#0bda54"
      },
      fontFamily: {
        display: ["Manrope", "sans-serif"]
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px"
      }
    }
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")]
};
