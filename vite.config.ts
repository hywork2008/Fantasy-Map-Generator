import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    root: './src',
    envDir: '../',
    base: process.env.NETLIFY ? '/' : '/Fantasy-Map-Generator/',
    build: {
        outDir: '../dist',
        assetsDir: './',
        emptyOutDir: false,
    },
    publicDir: '../public',
    plugins: [
        react(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: '.',
            filename: 'sw.ts',
            // Keep manual navigator.serviceWorker.register() in main.ts
            injectRegister: null,
            // Do not generate a web app manifest
            manifest: false,
            injectManifest: {
                // Skip precache manifest injection (runtime-only caching)
                injectionPoint: undefined,
            },
        }),
    ],
});