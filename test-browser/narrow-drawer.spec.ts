'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test, type Page } from '@playwright/test'

import { workspace } from './fixtures.ts'

const PHONE = { width: 412, height: 800 }
const DESKTOP = { width: 1400, height: 900 }

async function openDrawer(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-explorer', 'closed')
  await page.locator('#toggle-explorer').click()
  await expect(page.locator('#app')).toHaveAttribute('data-explorer', 'open')
}

test('an open drawer takes the whole width and the editor steps aside', async ({ page, request }) => {
  const folder = `narrow-${String(Date.now())}`
  await page.setViewportSize(PHONE)
  await page.goto(await workspace(request, folder))
  await openDrawer(page)

  const explorer = await page.locator('#explorer').boundingBox()

  await givenAsync(expect(page.locator('.cm-content')).toBeHidden())
  expect(explorer?.width).toBe(PHONE.width - (explorer?.x ?? 0))

  await request.delete(`/api/files/entries/${folder}`)
})

test('the hidden editor leaves the page, rather than sitting invisibly in the tab order', async ({ page, request }) => {
  const folder = `narrowg-${String(Date.now())}`
  await page.setViewportSize(PHONE)
  await page.goto(await workspace(request, folder))
  await openDrawer(page)

  const rendered = await page.locator('.cm-content').evaluate((element) => element.checkVisibility())

  expect(rendered).toBe(false)

  await request.delete(`/api/files/entries/${folder}`)
})

test('the editor comes back at its full width when the drawer closes', async ({ page, request }) => {
  const folder = `narrowb-${String(Date.now())}`
  await page.setViewportSize(PHONE)
  await page.goto(await workspace(request, folder))
  const wide = await page.locator('.cm-content').boundingBox()
  await openDrawer(page)

  await page.locator('#toggle-explorer').click()

  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())
  expect((await page.locator('.cm-content').boundingBox())?.width).toBe(wide?.width)

  await request.delete(`/api/files/entries/${folder}`)
})

test('the editor still takes an edit after being hidden behind the drawer', async ({ page, request }) => {
  const folder = `narrowc-${String(Date.now())}`
  await page.setViewportSize(PHONE)
  await page.goto(await workspace(request, folder))
  await openDrawer(page)
  await page.locator('#toggle-explorer').click()

  await page.locator('.cm-content').click()
  await page.keyboard.type('still here')

  await expect(page.locator('.cm-content')).toContainText('still here')

  await request.delete(`/api/files/entries/${folder}`)
})

test('the resize handle is gone, because a full-width drawer has no edge to drag', async ({ page, request }) => {
  const folder = `narrowd-${String(Date.now())}`
  await page.setViewportSize(PHONE)
  await page.goto(await workspace(request, folder))
  await openDrawer(page)

  await expect(page.locator('#explorer-resizer')).toBeHidden()

  await request.delete(`/api/files/entries/${folder}`)
})

test('inserting from the drawer closes it, revealing what was inserted', async ({ page, request }) => {
  const folder = `narrowe-${String(Date.now())}`
  await page.setViewportSize(PHONE)
  await page.goto(await workspace(request, folder))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await openDrawer(page)
  await page.locator(`[role="treeitem"][data-path="${folder}/other.md"]`).click()

  await page.locator('#insert-entry').click()

  await givenAsync(expect(page.locator('#app')).toHaveAttribute('data-explorer', 'closed'))
  await expect(page.locator('.cm-content')).toContainText('[other.md](other.md)')

  await request.delete(`/api/files/entries/${folder}`)
})

test('a wide window keeps the explorer open after an insert, since nothing was covered', async ({ page, request }) => {
  const folder = `narrowf-${String(Date.now())}`
  await page.setViewportSize(DESKTOP)
  await page.goto(await workspace(request, folder))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.locator(`[role="treeitem"][data-path="${folder}/other.md"]`).click()

  await page.locator('#insert-entry').click()

  await givenAsync(expect(page.locator('.cm-content')).toContainText('[other.md](other.md)'))
  await expect(page.locator('#app')).toHaveAttribute('data-explorer', 'open')

  await request.delete(`/api/files/entries/${folder}`)
})
