'use sanity'

import { expect, test, type APIRequestContext } from '@playwright/test'

import { stringFieldOf } from './json.ts'

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

test('a trash entry url shows what was deleted and offers it back', async ({ page, request }) => {
  const name = `deleted-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '# gone' } })
  const trashId = await stringFieldOf(await request.delete(`/api/files/entries/${name}`), 'trashId')

  await page.goto(`/trash/${trashId}`)

  await expect(page.locator('#view-deleted')).toBeVisible()
  await expect(page.locator('#deleted-what')).toContainText(`The file ${name} was deleted`)
  await expect(page).toHaveTitle(name)

  await page.locator('#deleted-restore').click()

  await expect(page.locator('.cm-content')).toContainText('# gone')
})

test('a trash entry that is no longer there says so', async ({ page }) => {
  await page.goto('/trash/0d5caef1-147f-45bf-8546-270886fcaa8f')

  await expect(page.locator('#view-deleted')).toBeVisible()
  await expect(page.locator('#deleted-what')).toContainText('already have been restored or purged')
  await expect(page.locator('#deleted-actions')).toBeHidden()
})

// A complete 1x1 PNG: a signature and IHDR alone decode nowhere, so a truncated
// one reaches the browser and then fails, which reads as a missing image.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function storedImage(request: APIRequestContext, name: string, directory = ''): Promise<string> {
  const stored = await request.post('/api/files/uploads', {
    multipart: { path: directory, file: { name, mimeType: 'image/png', buffer: PNG_BYTES } },
  })
  expect(stored.status()).toBe(201)

  return `/doc/${await stringFieldOf(stored, 'path')}`
}

test('an image path shows the image rather than failing to start', async ({ page, request }) => {
  const name = `shown-${String(Date.now())}.png`

  await page.goto(await storedImage(request, name))

  await expect(page.locator('#view-image')).toBeVisible()
  await expect(page.locator('#image-path')).toHaveText(name)
  await expect(page.locator('#editor')).toBeHidden()
  await expect(page.locator('#status .toast')).toHaveCount(0)
})

test('an image offers to download itself under its own name', async ({ page, request }) => {
  const name = `download-${String(Date.now())}.png`

  await page.goto(await storedImage(request, name, 'pictures'))

  const link = page.locator('#image-download')
  await expect(link).toHaveAttribute('href', `/api/files/raw/pictures/${name}`)
  await expect(link).toHaveAttribute('download', name)
})

test('an image that is not there reports itself as missing', async ({ page }) => {
  const name = `absent-${String(Date.now())}.png`

  await page.goto(`/doc/${name}`)

  await expect(page.locator('#view-missing')).toBeVisible()
  await expect(page.locator('#missing-path')).toHaveText(name)
  await expect(page.locator('#missing-create')).toBeHidden()
  await expect(page.locator('#missing-upload')).toBeVisible()
})

test('a double click navigates without a full page load', async ({ page, request }) => {
  const first = `spa-a-${String(Date.now())}.md`
  const second = `spa-b-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })

  await page.goto(`/doc/${first}`)
  await page.evaluate(() => {
    window.name = 'kept-across-soft-navigation'
  })

  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()

  await expect(page.locator('.cm-content')).toContainText('# second')
  expect(new URL(page.url()).pathname).toBe(`/doc/${second}`)
  expect(await page.evaluate(() => window.name)).toBe('kept-across-soft-navigation')

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('back returns to the document that was open before', async ({ page, request }) => {
  const first = `back-a-${String(Date.now())}.md`
  const second = `back-b-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })

  await page.goto(`/doc/${first}`)
  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()
  await expect(page.locator('.cm-content')).toContainText('# second')

  await expect(page.locator('#nav-back')).toBeEnabled()
  await page.locator('#nav-back').click()

  await expect(page.locator('.cm-content')).toContainText('# first')
  expect(new URL(page.url()).pathname).toBe(`/doc/${first}`)

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('the forward button becomes usable only after going back', async ({ page, request }) => {
  const first = `fwd-a-${String(Date.now())}.md`
  const second = `fwd-b-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: first, content: '# first' } })
  await request.post('/api/files/documents', { data: { path: second, content: '# second' } })

  await page.goto(`/doc/${first}`)
  await page.locator(`[role="treeitem"][data-path="${second}"]`).dblclick()
  await expect(page.locator('.cm-content')).toContainText('# second')
  await expect(page.locator('#nav-forward')).toBeDisabled()

  await page.locator('#nav-back').click()
  await expect(page.locator('.cm-content')).toContainText('# first')

  await expect(page.locator('#nav-forward')).toBeEnabled()
  await page.locator('#nav-forward').click()

  await expect(page.locator('.cm-content')).toContainText('# second')

  await request.delete(`/api/files/entries/${first}`)
  await request.delete(`/api/files/entries/${second}`)
})

test('the archive link is left to the browser rather than intercepted', async ({ page }) => {
  await page.goto('/doc/')

  const download = page.waitForEvent('download')
  await page.locator('#download-archive').click()

  expect((await download).suggestedFilename()).toContain('.zip')
})
