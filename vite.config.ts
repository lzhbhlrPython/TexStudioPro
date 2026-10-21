import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const productionCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: texpro-asset:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' ws: http: https:; frame-src 'self' texpro-asset:; media-src 'self' texpro-asset: data:; object-src 'none'; base-uri 'self'; form-action 'none'";

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'texpro-production-csp',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${productionCsp}" />`,
        );
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
});
