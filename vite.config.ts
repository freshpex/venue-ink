import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      onwarn(warning, warn) {
        // Zod's prose comments quote PURE annotations; Rollup safely removes them.
        if (
          warning.code === 'INVALID_ANNOTATION' &&
          /\/node_modules\/zod\/v4\/core\/(util|regexes)\.js$/.test(
            (warning.id || '').replaceAll('\\', '/'),
          ) &&
          warning.message.includes('`@__PURE__`')
        )
          return;
        warn(warning);
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            /node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(
              id.replaceAll('\\', '/'),
            )
          )
            return 'motion';
          if (/node_modules\/(@tanstack)\//.test(id.replaceAll('\\', '/'))) return 'query';
          if (/node_modules\/(@radix-ui)\//.test(id.replaceAll('\\', '/'))) return 'radix';
          if (
            /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(
              id.replaceAll('\\', '/'),
            )
          )
            return 'react';
        },
      },
    },
  },
});
