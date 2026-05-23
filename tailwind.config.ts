import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b0d12",
        canvas: "#f6f4ef",
        accent: "#0f6f56",
        muted: "#6b7280"
      }
    }
  },
  plugins: []
};

export default config;
