import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // Externalize native modules so they're not bundled
        'uiohook-napi',
        'electron',
      ],
    },
  },
});
