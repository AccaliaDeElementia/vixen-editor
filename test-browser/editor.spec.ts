'use sanity'

import { expect, test, type APIRequestContext } from '@playwright/test'

function newDocument(name: string): string {
  return `/doc/${name}`
}

// A named document that is not stored now opens the missing view rather than a
// template, so a spec that wants an editor has to create the document first.
async function given(request: APIRequestContext, name: string, content = '# seed'): Promise<string> {
  await request.post('/api/files/documents', { data: { path: name, content } })

  return newDocument(name)
}

test('mounts the editor', async ({ page, request }) => {
  await page.goto(await given(request, 'mounts.md'))

  await expect(page.locator('.cm-editor')).toBeVisible()
  await expect(page.locator('#status')).toContainText('mounts.md')
})

test('renders a heading decoration with real geometry', async ({ page, request }) => {
  await page.goto(await given(request, 'heading.md'))
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

test('renders a marker decoration inline', async ({ page, request }) => {
  await page.goto(await given(request, 'marker.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('TODO: something')

  const marker = page.locator('.cm-vixen-marker-todo').first()
  await expect(marker).toBeVisible()
  await expect(marker).toHaveText('TODO:')
})

test('a heading renders taller than body text', async ({ page, request }) => {
  await page.goto(await given(request, 'sizing.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('# heading\nplain body text')

  const headingBox = await page.locator('.cm-vixen-heading-1').first().boundingBox()
  const bodyBox = await page.locator('.cm-line').nth(1).boundingBox()

  expect(headingBox?.height ?? 0).toBeGreaterThan(bodyBox?.height ?? 0)
})

test('persists a document across a reload', async ({ page, request }) => {
  const doc = `persist-${String(Date.now())}.md`

  await page.goto(await given(request, doc))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('# persisted content')
  await page.keyboard.press('Control+s')
  await expect(page.locator('#status')).toContainText('Saved')

  await page.reload()

  await expect(page.locator('.cm-content')).toContainText('# persisted content')
})

test('the editor has real geometry after being revealed from hidden', async ({ page, request }) => {
  await page.goto(await given(request, 'revealed.md'))

  const editor = page.locator('#editor')
  await expect(editor).toBeVisible()

  const content = page.locator('.cm-content')
  const box = await content.boundingBox()

  expect(box?.width ?? 0).toBeGreaterThan(0)
  expect(box?.height ?? 0).toBeGreaterThan(0)
})

test('a long line wraps instead of scrolling the editor sideways', async ({ page, request }) => {
  await page.goto(await given(request, 'wrapping.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('lorem ipsum dolor sit amet '.repeat(40))

  const overflow = await page.locator('.cm-scroller').evaluate((el) => el.scrollWidth - el.clientWidth)

  expect(overflow).toBeLessThanOrEqual(1)
})

test('a path that names nothing reports itself as missing', async ({ page }) => {
  await page.goto('/doc/definitely/not/here.md')

  await expect(page.locator('#view-missing')).toBeVisible()
  await expect(page.locator('#missing-path')).toHaveText('definitely/not/here.md')
  await expect(page.locator('#editor')).toBeHidden()
})

test('a folder with no index still opens an editable buffer', async ({ page }) => {
  await page.goto('/doc/')

  await expect(page.locator('#editor')).toBeVisible()
  await expect(page.locator('#view-missing')).toBeHidden()
})

test('the title names the last two path segments', async ({ page, request }) => {
  await page.goto(await given(request, 'titled.md'))

  await expect(page).toHaveTitle('titled.md')
})
