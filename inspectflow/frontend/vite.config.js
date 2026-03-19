import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: [react()],
  server: {
    port: parseInt(process.env.PORT) || 5173
  }
}));
