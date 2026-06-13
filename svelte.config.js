import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // Domänen-Bibliothek + Services unter $core importierbar (z.B. "$core/services/library.ts").
    alias: { $core: "core" },
  },
};

export default config;
