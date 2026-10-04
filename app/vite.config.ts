import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    // `npm run dev` serves the UI; API calls go to `wrangler dev` on :8787
    proxy: { "/api": "http://localhost:8787" },
  },
});
