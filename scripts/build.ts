'use sanity'

import { build } from 'esbuild'

const production = process.env.NODE_ENV === 'production'

const cjsInteropBanner = [
  "import { createRequire as __vixenCreateRequire } from 'node:module'",
  'const require = __vixenCreateRequire(import.meta.url)',
].join('\n')

async function buildClient(): Promise<void> {
  await build({
    entryPoints: ['client/main.ts'],
    outfile: 'public/assets/main.js',
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    minify: production,
    sourcemap: true,
    logLevel: 'info',
  })
}

async function buildServer(): Promise<void> {
  await build({
    entryPoints: ['index.ts'],
    outfile: 'dist/index.js',
    bundle: true,
    format: 'esm',
    target: 'node26',
    platform: 'node',
    minify: false,
    sourcemap: true,
    logLevel: 'info',
    // Transitive CommonJS dependencies reference `require` in module scope,
    // which does not exist in an ESM bundle unless it is reconstructed.
    banner: { js: cjsInteropBanner },
  })
}

await Promise.all([buildClient(), buildServer()])
