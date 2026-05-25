export default {
    root: './src',
    base: process.env.NETLIFY ? '/' : '/Fantasy-Map-Generator/',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        assetsDir: './',
    },
    publicDir: '../public',
    resolve: {
        alias: {
            '#modules': new URL('./packages/@fmg/core/src/modules', import.meta.url).pathname,
            '#utils': new URL('./src/utils', import.meta.url).pathname,
            '#types': new URL('./src/types', import.meta.url).pathname,
            '#renderers': new URL('./src/renderers', import.meta.url).pathname,
            '@fmg/core': new URL('./packages/@fmg/core/src', import.meta.url).pathname,
            '@fmg/shared': new URL('./packages/@fmg/shared/src', import.meta.url).pathname,
            '@fmg/types': new URL('./packages/@fmg/types/src', import.meta.url).pathname,
            '@fmg/legacy-ui': new URL('./packages/@fmg/legacy-ui/src', import.meta.url).pathname,
            '@legacy-ui-runtime': new URL('./packages/@fmg/legacy-ui/src', import.meta.url).pathname,
            '@fmg/burgs': new URL('./packages/@fmg/burgs/src', import.meta.url).pathname,
            '@fmg/rivers': new URL('./packages/@fmg/rivers/src', import.meta.url).pathname,
            '@fmg/states': new URL('./packages/@fmg/states/src', import.meta.url).pathname,
            '@fmg/markers': new URL('./packages/@fmg/markers/src', import.meta.url).pathname,
            '@fmg/ocean': new URL('./packages/@fmg/ocean/src', import.meta.url).pathname,
        }
    }
}