import {defineConfig, loadEnv} from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
    const env = loadEnv(mode, process.cwd(), 'VITE')
    return {
        server: {
            host: '127.0.0.1',
            port: 3001,
            hmr: true,
        },
        base: env.VITE_STATIC_URL || '/',
        plugins: [vue(),
            VitePWA({
                // The Worker serves ../mail-worker/dist, not this package's
                // default ./dist directory. Keep the service worker beside the
                // deployed index.html so a phone receives the new worker too.
                outDir: env.VITE_OUT_DIR || 'dist',
                injectRegister: 'script-defer',
                // Phones frequently keep a previously installed app shell open
                // for days. Activate a deployed fix as soon as it is available
                // instead of leaving a member on stale login/auth code.
                registerType: 'autoUpdate',
                manifest: {
                    name: env.VITE_PWA_NAME,
                    short_name: env.VITE_PWA_NAME,
                    background_color: '#FFFFFF',
                    theme_color: '#FF5500',
                    icons: [
                        {
                            src: 'android-chrome-192x192.png',
                            sizes: '192x192',
                            type: 'image/png',
                        },
                        {
                            src: 'android-chrome-512x512.png',
                            sizes: '512x512',
                            type: 'image/png',
                        },
                    ],
                },
                workbox: {
                    disableDevLogs: true,
                    clientsClaim: true,
                    skipWaiting: true,
                    globPatterns: [],
                    runtimeCaching: [],
                    navigateFallback: null,
                    // XPass HQ is an online workspace. A stale service worker
                    // is worse than no offline shell: it can keep phones on
                    // old sign-in code and make a valid session look expired.
                    // This deployment retires any existing PWA cache and lets
                    // the browser load the current hosted application.
                    selfDestroying: true,
                    cleanupOutdatedCaches: true,
                }
            }),
            AutoImport({
                resolvers: [ElementPlusResolver()],
            }),
            Components({
                resolvers: [ElementPlusResolver()],
            })
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src')
            }
        },
        build: {
            target: 'es2022',
            outDir: env.VITE_OUT_DIR || 'dist',
            emptyOutDir: true,
            assetsInclude: ['**/*.json']
        }
    }
})
