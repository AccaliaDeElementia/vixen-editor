'use sanity'

import { expect, test, type Page } from '@playwright/test'

import { stringFieldOf } from './json.ts'

const MINIMUM = 24

interface Target {
  what: string
  width: number
  height: number
}

async function undersizedTargetsOn(page: Page): Promise<Target[]> {
  return await page.evaluate((minimum) => {
    const selector = 'button, a[href], [role="treeitem"], [role="separator"], input, summary'

    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => element.offsetParent !== null && element.getAttribute('disabled') === null)
      .map((element) => {
        const box = element.getBoundingClientRect()
        const label = element.getAttribute('aria-label') ?? element.id

        return {
          what: `${element.tagName.toLowerCase()} ${label}`,
          width: Math.round(box.width),
          height: Math.round(box.height),
        }
      })
      .filter((target) => target.width < minimum || target.height < minimum)
  }, MINIMUM)
}

test('every pointer target in the workspace is at least 24 by 24', async ({ page, request }) => {
  const folder = `size-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: `${folder}/notes.md`, content: '# hi\n' } })

  await page.goto(`/doc/${folder}/notes.md`)
  await expect(page.locator('[role="tree"]')).toBeVisible()

  expect(await undersizedTargetsOn(page)).toStrictEqual([])

  await request.delete(`/api/files/entries/${folder}`)
})

test('every pointer target in an open dialog is at least 24 by 24', async ({ page, request }) => {
  const folder = `sized-${String(Date.now())}`
  await request.post('/api/files/folders', { data: { path: folder } })

  await page.goto(`/doc/${folder}/`)
  await page.locator('#new-document').click()
  await expect(page.locator('#file-dialog')).toBeVisible()

  expect(await undersizedTargetsOn(page)).toStrictEqual([])

  await page.locator('#file-dialog-cancel').click()
  await request.delete(`/api/files/entries/${folder}`)
})

test('every pointer target in a merge is at least 24 by 24', async ({ page, request }) => {
  const name = `sizem-${String(Date.now())}.md`
  const created = await request.post('/api/files/documents', { data: { path: name, content: '# first' } })
  const etag = await stringFieldOf(created, 'etag')

  await page.goto(`/doc/${name}`)
  await page.locator('.cm-content').click()
  await page.keyboard.type('mine ')
  await request.put(`/api/documents/${name}`, {
    headers: { 'if-match': etag, 'content-type': 'application/json' },
    data: { content: '# changed by someone else' },
  })
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
  })
  await page.locator('#file-dialog-choices button[value="merge"]').click()
  await expect(page.locator('.cm-chunkButtons button').first()).toBeVisible()

  expect(await undersizedTargetsOn(page)).toStrictEqual([])

  await request.delete(`/api/files/entries/${name}`)
})
