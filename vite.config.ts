import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
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
        {
            name: 'dev-dump-state',
            configureServer(server) {
                server.middlewares.use('/api/dev/dump-state', (req, res) => {
                    if (req.method === 'POST') {
                        let body = '';
                        req.on('data', chunk => {
                            body += chunk.toString();
                        });
                        req.on('end', () => {
                            try {
                                const dataDir = path.resolve(__dirname, 'docs/debug');
                                if (!fs.existsSync(dataDir)) {
                                    fs.mkdirSync(dataDir, { recursive: true });
                                }
                                // Use timestamp if single export, or allow client to name it
                                const filename = `fmg_state_dump_${Date.now()}.json`;
                                fs.writeFileSync(path.join(dataDir, filename), body);
                                res.statusCode = 200;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ success: true, file: filename }));
                            } catch (e) {
                                res.statusCode = 500;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ success: false, error: String(e) }));
                            }
                        });
                    } else {
                        res.statusCode = 405;
                        res.end('Method Not Allowed');
                    }
                });
            }
        },
    ],
});