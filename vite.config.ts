import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  // Natives Modul nicht bundeln (Server-seitig extern halten).
  ssr: { external: ["better-sqlite3"] },
});
