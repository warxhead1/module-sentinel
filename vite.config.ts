import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "src/dashboard",
  publicDir: "../../dashboard/spa",
  base: "./", // Use relative paths for assets
  build: {
    outDir: "../../dashboard/dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/dashboard/index.html"),
      },
    },
  },
  server: {
    port: 6969,
    host: true,
    strictPort: false,
    hmr: {
      port: 6970,
      overlay: false // Disable error overlay
    },
    watch: {
      // Exclude database and build files from watching
      ignored: [
        '**/node_modules/**',
        '**/.test-db/**',
        '**/dist/**',
        '**/dashboard/dist/**',
        '**/*.db',
        '**/*.db-shm',
        '**/*.db-wal'
      ]
    }
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/dashboard"),
      "@shared": resolve(__dirname, "src/shared"),
      "@api": resolve(__dirname, "src/api"),
    },
  },
  define: {
    __DEV__: process.env.NODE_ENV === "development",
  },
});
