'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildIdFor } from '../../src/server/build-id.ts'

let publicDir = ''
let templatesDir = ''

async function writeAsset(name: string, contents: string): Promise<void> {
  const at = path.join(publicDir, 'assets', name)
  await fs.mkdir(path.dirname(at), { recursive: true })
  await fs.writeFile(at, contents)
}

async function writeBundle(contents: string): Promise<void> {
  await writeAsset('main.js', contents)
}

async function writeTemplate(name: string, contents: string): Promise<void> {
  await fs.writeFile(path.join(templatesDir, name), contents)
}

async function identity(): Promise<string | null> {
  return await buildIdFor(publicDir, templatesDir)
}

beforeEach(async () => {
  publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-build-'))
  templatesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-templates-'))
})

afterEach(async () => {
  await fs.rm(publicDir, { recursive: true, force: true })
  await fs.rm(templatesDir, { recursive: true, force: true })
})

describe('the identity of the build being served', () => {
  it('comes from the artifact, so a restart alone does not change it', async () => {
    await writeBundle('console.log(1)')
    const first = await identity()

    const again = await identity()

    expect(again).toBe(first)
  })

  it('changes when the bundle does, which is the whole point', async () => {
    await writeBundle('console.log(1)')
    const before = await identity()
    await writeBundle('console.log(2)')

    const after = await identity()

    expect(after).not.toBe(before)
  })

  it('is unknown rather than invented when there is no bundle to read', async () => {
    expect(await identity()).toBeNull()
  })
})

describe('everything the client is served, not only its script', () => {
  it('changes when the stylesheet does, because that is what the page looks like', async () => {
    await writeBundle('console.log(1)')
    await writeAsset('main.css', '.a { color: red }')
    const before = await identity()

    await writeAsset('main.css', '.a { color: blue }')

    expect(await identity()).not.toBe(before)
  })

  it('changes when a template does, because that is the markup the client is wired to', async () => {
    await writeBundle('console.log(1)')
    await writeTemplate('editor.pug', 'p before')
    const before = await identity()

    await writeTemplate('editor.pug', 'p after')

    expect(await identity()).not.toBe(before)
  })

  it('changes when an included template does, since the page is rendered from all of them', async () => {
    await writeBundle('console.log(1)')
    await writeTemplate('_ribbon.pug', 'nav before')
    const before = await identity()

    await writeTemplate('_ribbon.pug', 'nav after')

    expect(await identity()).not.toBe(before)
  })

  it('changes when the icon font does, since a glyph is part of what is shown', async () => {
    await writeBundle('console.log(1)')
    await writeAsset('icons.woff2', 'before')
    const before = await identity()

    await writeAsset('icons.woff2', 'after')

    expect(await identity()).not.toBe(before)
  })

  it('still answers when there are no templates to read, since the script alone is an identity', async () => {
    await writeBundle('console.log(1)')
    await fs.rm(templatesDir, { recursive: true, force: true })

    expect(await identity()).not.toBeNull()
  })

  it('ignores a file beside the templates that is not one, so a stray note changes nothing', async () => {
    await writeBundle('console.log(1)')
    await writeTemplate('editor.pug', 'p stable')
    const before = await identity()

    await writeTemplate('notes.txt', 'scratch')

    expect(await identity()).toBe(before)
  })

  it('changes when an asset is renamed, not only when its bytes are', async () => {
    await writeBundle('console.log(1)')
    await writeAsset('one.css', 'same')
    const before = await identity()
    await fs.rm(path.join(publicDir, 'assets', 'one.css'))

    await writeAsset('two.css', 'same')

    expect(await identity()).not.toBe(before)
  })
})
