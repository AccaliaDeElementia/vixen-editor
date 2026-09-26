'use sanity'

import { expect, test, type APIRequestContext } from '@playwright/test'

function newDocument(name: string): string {
  return `/doc/${name}`
}

async function storedDocument(request: APIRequestContext, name: string, content = '# seed'): Promise<string> {
  await request.post('/api/files/documents', { data: { path: name, content } })

  return newDocument(name)
}

test('mounts the editor', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'mounts.md'))

  await expect(page.locator('.cm-editor')).toBeVisible()
  await expect(page.locator('#status')).toContainText('mounts.md')
})

test('renders a heading decoration with real geometry', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'heading.md'))
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
  await page.goto(await storedDocument(request, 'marker.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('TODO: something')

  const marker = page.locator('.cm-vixen-marker-todo').first()
  await expect(marker).toBeVisible()
  await expect(marker).toHaveText('TODO:')
})

test('a heading renders taller than body text', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'sizing.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('# heading\nplain body text')

  const headingBox = await page.locator('.cm-vixen-heading-1').first().boundingBox()
  const bodyBox = await page.locator('.cm-line').nth(1).boundingBox()

  expect(headingBox?.height ?? 0).toBeGreaterThan(bodyBox?.height ?? 0)
})

test('persists a document across a reload', async ({ page, request }) => {
  const doc = `persist-${String(Date.now())}.md`

  await page.goto(await storedDocument(request, doc))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('# persisted content')
  await page.keyboard.press('Control+s')
  await expect(page.locator('#status')).toContainText('Saved')

  await page.reload()

  await expect(page.locator('.cm-content')).toContainText('# persisted content')
})

test('the editor has real geometry after being revealed from hidden', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'revealed.md'))

  const editor = page.locator('#editor')
  await expect(editor).toBeVisible()

  const content = page.locator('.cm-content')
  const box = await content.boundingBox()

  expect(box?.width ?? 0).toBeGreaterThan(0)
  expect(box?.height ?? 0).toBeGreaterThan(0)
})

test('a long line wraps instead of scrolling the editor sideways', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'wrapping.md'))
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
  await page.goto(await storedDocument(request, 'titled.md'))

  await expect(page).toHaveTitle('titled.md')
})

test('the status bar names the open path and counts its words', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'status.md', '# one two three'))

  await expect(page.locator('#open-path')).toHaveText('status.md')
  await expect(page.locator('#word-count')).toHaveText('4 words')
})

test('the word count follows what is typed', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'counting.md', 'seed'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('alpha beta gamma')

  await expect(page.locator('#word-count')).toHaveText('3 words')
})

test('an edit starts a countdown bar that shrinks', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'countdown.md', 'seed'))
  await page.locator('.cm-content').click()
  await page.keyboard.type(' edited')

  await expect(page.locator('#save-label')).toHaveText('Save pending')

  const bar = page.locator('#save-countdown')
  const width = async (): Promise<number> => (await bar.boundingBox())?.width ?? 0

  const started = await width()
  await expect.poll(width, { timeout: 4000 }).toBeLessThan(started)
})

test('a further edit restarts the countdown rather than letting it run down', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'restart.md', 'seed'))
  await page.locator('.cm-content').click()
  await page.keyboard.type(' first')

  const bar = page.locator('#save-countdown')
  const width = async (): Promise<number> => (await bar.boundingBox())?.width ?? 0

  const started = await width()
  await expect.poll(width, { timeout: 4000 }).toBeLessThan(started)
  const shrunk = await width()

  await page.keyboard.type(' second')

  await expect.poll(width, { timeout: 2000 }).toBeGreaterThan(shrunk)
})

test('a missing document offers to create it, and creating it opens the editor', async ({ page }) => {
  const name = `created-${String(Date.now())}.md`
  await page.goto(`/doc/${name}`)

  await expect(page.locator('#view-missing')).toBeVisible()
  await page.locator('#missing-create').click()

  await expect(page.locator('#editor')).toBeVisible()
  await expect(page.locator('#open-path')).toHaveText(name)
})

test('a trashed document is offered back at the path it came from', async ({ page, request }) => {
  const name = `trashed-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# rescued' } })
  await request.delete(`/api/files/entries/${name}`)

  await page.goto(`/doc/${name}`)

  const restore = page.locator('#missing-restore-list button')
  await expect(restore).toBeVisible()
  await restore.click()

  await expect(page.locator('.cm-content')).toContainText('# rescued')
})
