import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    // Never expose the dev server to the LAN (see docs/DESIGN.md 5).
    host: '127.0.0.1',
  },
});
