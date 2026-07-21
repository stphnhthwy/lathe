import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The studio UI builds into the CLI's dist/ so the packaged `lathe studio`
// serves it from dist/studio/ui (see src/studio/server.ts).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../dist/studio/ui",
    emptyOutDir: true,
  },
  server: {
    // Dev inner loop: `lathe studio --no-open` serves the API on 4989 while
    // vite serves the UI with HMR.
    proxy: {
      "/api": "http://127.0.0.1:4989",
    },
  },
})
