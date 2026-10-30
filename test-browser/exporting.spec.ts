'use sanity'

import fs from 'node:fs/promises'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { storedDocument } from './fixtures.ts'

const A_DOCUMENT = '# Saved heading\n\nwith prose and a [link](other.md).\n'

test('the editing bar saves a copy of the document as html', async ({ page, request }) => {
  const stamp = String(Date.now())
  await page.goto(await storedDocument(request, `saved-${stamp}.md`, A_DOCUMENT))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  const saving = page.waitForEvent('download')
  await page.locator('[data-part="save-html"]').click()

  expect((await saving).suggestedFilename()).toBe(`saved-${stamp}.html`)
})

test('the file it saves is the document rendered, with nothing of the editor in it', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `savedhtml-${String(Date.now())}.md`, A_DOCUMENT))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  const saving = page.waitForEvent('download')
  await page.locator('[data-part="save-html"]').click()
  const saved = await fs.readFile(await (await saving).path(), 'utf8')

  expect([saved.includes('<h1>Saved heading</h1>'), saved.includes('class='), saved.includes('<style')]).toStrictEqual([
    true,
    false,
    false,
  ])
})
