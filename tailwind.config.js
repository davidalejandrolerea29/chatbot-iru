/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",   // Fondo principal blanco
        surface: "#f9fafb",      // Fondos suaves (inputs, cards)
        border: "#e5e7eb",       // Bordes grises claros
        text: {
          primary: "#111827",    // Texto principal
          secondary: "#6b7280",  // Texto secundario
        },
        brand: {
          green: "#16a34a",      // Verde corporativo
          purple: "#7c3aed",     // Morado para el bot
        }
      }
    },
  },
  plugins: [],
};
