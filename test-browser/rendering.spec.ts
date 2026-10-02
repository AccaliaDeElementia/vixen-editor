'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

test('mounts the editor', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'mounts.md'))

  await givenAsync(expect(page.locator('.cm-editor')).toBeVisible())
  await expect(page.locator('#status')).toContainText('mounts.md')
})

test('renders a heading decoration with real geometry', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'heading.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('# a heading')

  const heading = page.locator('.cm-vixen-heading-1').first()
  await givenAsync(expect(heading).toBeVisible())

  const box = await heading.boundingBox()
  expect({ width: (box?.width ?? 0) > 0, height: (box?.height ?? 0) > 0 }).toStrictEqual({
    width: true,
    height: true,
  })
})

test('renders a marker decoration inline', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'marker.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('TODO: something')

  const marker = page.locator('.cm-vixen-marker-todo').first()
  await givenAsync(expect(marker).toBeVisible())
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

test('the editor has real geometry after being revealed from hidden', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'revealed.md'))

  const editor = page.locator('#editor')
  await givenAsync(expect(editor).toBeVisible())

  const content = page.locator('.cm-content')
  const box = await content.boundingBox()

  expect({ width: (box?.width ?? 0) > 0, height: (box?.height ?? 0) > 0 }).toStrictEqual({
    width: true,
    height: true,
  })
})

test('a long line wraps instead of scrolling the editor sideways', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'wrapping.md'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('lorem ipsum dolor sit amet '.repeat(40))

  const overflow = await page.locator('.cm-scroller').evaluate((el) => el.scrollWidth - el.clientWidth)

  expect(overflow).toBeLessThanOrEqual(1)
})

test('links past the first parse of a long document decorate without being typed at', async ({ page, request }) => {
  const name = `frontier-${String(Date.now())}.md`
  const block = '# A heading\n\nProse with a [link](./other.md) and more words padding the line out.\n\n'
  let body = ''
  while (body.length < 120 * 1024) body += block
  body += '\nTAIL [the last link](./last.md) TAIL\n'

  await request.post('/api/files/documents', { data: { path: name, content: body } })
  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('A heading'))

  await page.evaluate(() => {
    const scroller = document.querySelector('.cm-scroller')
    if (scroller === null) return

    const { scrollHeight } = scroller
    scroller.scrollTop = scrollHeight
  })

  await expect(page.locator('.cm-vixen-link[data-destination="./last.md"]')).toHaveCount(1)

  await request.delete(`/api/files/entries/${name}`)
})
