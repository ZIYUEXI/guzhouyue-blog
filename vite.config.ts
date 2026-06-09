import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@mdxeditor') || id.includes('lexical') || id.includes('codemirror')) {
            return 'editor';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4174',
      '/robots.txt': 'http://127.0.0.1:4174',
      '/rss.xml': 'http://127.0.0.1:4174',
      '/sitemap.xml': 'http://127.0.0.1:4174',
    },
  },
});
