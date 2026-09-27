'use sanity'

import { expect, test, type Page } from '@playwright/test'

import { violationsOn } from './axe.ts'

async function workspaceWith(page: Page, request: Page['request'], folder: string): Promise<void> {
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', {
    data: {
      path: `${folder}/notes.md`,
      content: '# A heading\n\nProse with a [link](notes.md) and a TODO: marker.\n',
    },
  })
}

test('the document view has no accessibility violations', async ({ page, request }) => {
  const folder = `a11y-doc-${String(Date.now())}`
  await workspaceWith(page, request, folder)

  await page.goto(`/doc/${folder}/notes.md`)
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.locator('[role="tree"]')).toBeVisible()

  expect(await violationsOn(page)).toStrictEqual([])

  await request.delete(`/api/files/entries/${folder}`)
})

test('an open dialog has no accessibility violations', async ({ page, request }) => {
  const folder = `a11y-dialog-${String(Date.now())}`
  await workspaceWith(page, request, folder)

  await page.goto(`/doc/${folder}/notes.md`)
  await page.locator('#new-document').click()
  await expect(page.locator('#file-dialog')).toBeVisible()

  expect(await violationsOn(page)).toStrictEqual([])

  await page.locator('#file-dialog-cancel').click()
  await request.delete(`/api/files/entries/${folder}`)
})

test('the missing-document view has no accessibility violations', async ({ page, request }) => {
  const folder = `a11y-missing-${String(Date.now())}`
  await workspaceWith(page, request, folder)

  await page.goto(`/doc/${folder}/absent.md`)
  await expect(page.locator('#view-missing')).toBeVisible()

  expect(await violationsOn(page)).toStrictEqual([])

  await request.delete(`/api/files/entries/${folder}`)
})
