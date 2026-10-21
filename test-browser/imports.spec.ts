'use sanity'

import { Buffer } from 'node:buffer'

import { givenAsync } from '../test/conditions.ts'
import { zipOf } from '../test/server/storage/zip-fixtures.ts'
import { expect, test } from './store-server.ts'

function archiveOf(entries: ReadonlyArray<{ name: string; bytes: Uint8Array }>): {
  name: string
  mimeType: string
  buffer: Buffer
} {
  return { name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from(zipOf(entries)) }
}

test('an imported archive puts its files in the open folder', async ({ page, request }) => {
  const folder = `import-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: folder } })
  await page.goto(`/doc/${folder}/`)
  await givenAsync(expect(page.locator(`[role="treeitem"][data-path="${folder}"]`)).toBeVisible())
  await page.locator(`[role="treeitem"][data-path="${folder}"]`).click()

  await page
    .locator('#import-input')
    .setInputFiles(archiveOf([{ name: 'imported.md', bytes: new TextEncoder().encode('# imported') }]))

  await expect(page.locator(`[role="treeitem"][data-path="${folder}/imported.md"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${folder}`)
})

test('an archive carrying an entry the store refuses names that entry', async ({ page }) => {
  await page.goto('/doc/')
  await givenAsync(expect(page.locator('#archive-actions')).toBeVisible())

  await page
    .locator('#import-input')
    .setInputFiles(archiveOf([{ name: '../escape.md', bytes: new TextEncoder().encode('# no') }]))

  await expect(page.locator('#status .toast[data-severity="error"]')).toContainText('../escape.md')
})
