'use sanity'

import { cp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { build } from 'esbuild'
import { compileAsync } from 'sass'

const production = process.env.NODE_ENV === 'production'

const STYLE_ENTRY = 'src/styles/main.scss'
const STYLE_OUTPUT = 'public/assets/main.css'

const ASSET_SOURCE = 'src/assets'
const ASSET_OUTPUT = 'public/assets'

const cjsInteropBanner = [
  "import { createRequire as __vixenCreateRequire } from 'node:module'",
  'const require = __vixenCreateRequire(import.meta.url)',
].join('\n')

export async function buildClient(): Promise<void> {
  await build({
    entryPoints: ['src/client/main.ts'],
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

export async function buildServer(): Promise<void> {
  await build({
    entryPoints: ['src/index.ts'],
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

export async function buildStyles(): Promise<void> {
  const compiled = await compileAsync(STYLE_ENTRY, {
    style: production ? 'compressed' : 'expanded',
    sourceMap: true,
  })

  await mkdir(path.dirname(STYLE_OUTPUT), { recursive: true })
  await Promise.all([
    writeFile(STYLE_OUTPUT, `${compiled.css}\n/*# sourceMappingURL=main.css.map */\n`),
    writeFile(`${STYLE_OUTPUT}.map`, JSON.stringify(compiled.sourceMap)),
  ])
}

export async function buildAssets(): Promise<void> {
  await mkdir(ASSET_OUTPUT, { recursive: true })
  await cp(ASSET_SOURCE, ASSET_OUTPUT, { recursive: true })
}

export async function buildDevAssets(): Promise<void> {
  await Promise.all([buildClient(), buildStyles(), buildAssets()])
}

export async function buildAll(): Promise<void> {
  await Promise.all([buildClient(), buildStyles(), buildAssets(), buildServer()])
}

if (import.meta.main) {
  await buildAll()
}
