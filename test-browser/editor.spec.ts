'use sanity'

import { expect, test } from '@playwright/test'

function newDocument(name: string): string {
  return `/doc/${name}`
}

test('mounts the editor', async ({ page }) => {
  await page.goto(newDocument('mounts.md'))

  await expect(page.locator('.cm-editor')).toBeVisible()
  await expect(page.locator('#status')).toContainText('mounts.md')
})

test('renders a heading decoration with real geometry', async ({ page }) => {
  await page.goto(newDocument('heading.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('# a heading')

  const heading = page.locator('.cm-vixen-heading-1').first()
  await expect(heading).toBeVisible()

  const box = await heading.boundingBox()
  expect(box).not.toBeNull()
  expect(box?.height ?? 0).toBeGreaterThan(0)
  expect(box?.width ?? 0).toBeGreaterThan(0)
})

test('renders a marker decoration inline', async ({ page }) => {
  await page.goto(newDocument('marker.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('TODO: something')

  const marker = page.locator('.cm-vixen-marker-todo').first()
  await expect(marker).toBeVisible()
  await expect(marker).toHaveText('TODO:')
})

test('a heading renders taller than body text', async ({ page }) => {
  await page.goto(newDocument('sizing.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('# heading\nplain body text')

  const headingBox = await page.locator('.cm-vixen-heading-1').first().boundingBox()
  const bodyBox = await page.locator('.cm-line').nth(1).boundingBox()

  expect(headingBox?.height ?? 0).toBeGreaterThan(bodyBox?.height ?? 0)
})

test('persists a document across a reload', async ({ page }) => {
  const doc = `persist-${String(Date.now())}.md`

  await page.goto(newDocument(doc))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('# persisted content')
  await page.keyboard.press('Control+s')
  await expect(page.locator('#status')).toContainText('Saved')

  await page.reload()

  await expect(page.locator('.cm-content')).toContainText('# persisted content')
})
