import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // One local bundle; Konva + React is ~600 kB and there's nothing to gain from splitting it.
  build: { chunkSizeWarningLimit: 1000 },
  // Saved designs live in the browser per address (port included), so always use the same port:
  // if 5173 is taken, fail loudly instead of quietly moving to 5174 with an empty design list.
  server: { port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
