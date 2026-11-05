import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { publicBootstrapPlugin } from './scripts/public-bootstrap.mjs';

export default defineConfig({
  plugins: [react(), publicBootstrapPlugin()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4174',
      '/robots.txt': 'http://127.0.0.1:4174',
      '/rss.xml': 'http://127.0.0.1:4174',
      '/sitemap.xml': 'http://127.0.0.1:4174',
    },
  },
});
