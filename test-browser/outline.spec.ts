'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { storedDocument } from './fixtures.ts'
import { violationsOn } from './axe.ts'

const WITH_HEADINGS = '# Title\n\nsome prose\n\n## A section\n\nmore prose\n'
const LAST_HEADING = 'The far heading'
const PAST_WHAT_THE_EDITOR_PARSES = 400
const LONG_ENOUGH_TO_SCROLL = `# Top\n\n${'filler paragraph\n\n'.repeat(PAST_WHAT_THE_EDITOR_PARSES)}## ${LAST_HEADING}\n\ntail\n`
const BOTH_HEADINGS = 2
const QUOTING_ANOTHER_DOCUMENT = '# Mine\n\n> # Theirs\n\n## My section\n'

test('the outline lists the headings of the document in front', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `outline-${String(Date.now())}.md`, WITH_HEADINGS))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  await page.locator('#show-outline').click()

  await expect(page.locator('[data-part="outline-list"] li')).toHaveText(['Title', 'A section'])
})

test('the outline follows a heading typed into the document, without being reopened', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `outline-live-${String(Date.now())}.md`, WITH_HEADINGS))
  await page.locator('#show-outline').click()
  await givenAsync(expect(page.locator('[data-part="outline-list"] li')).toHaveCount(2))

  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\n### Just typed\n')

  await expect(page.locator('[data-part="outline-list"] li')).toHaveText(['Title', 'A section', 'Just typed'])
})

test('the open outline has no accessibility violations', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `outline-a11y-${String(Date.now())}.md`, WITH_HEADINGS))
  await page.locator('#show-outline').click()
  await givenAsync(expect(page.locator('[data-part="outline-list"] li').first()).toBeVisible())

  expect(await violationsOn(page)).toStrictEqual([])
})

test('choosing a heading in the outline takes the reader to it', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `outline-jump-${String(Date.now())}.md`, LONG_ENOUGH_TO_SCROLL))
  await page.locator('#show-outline').click()
  await givenAsync(expect(page.locator('[data-part="outline-list"] button')).toHaveCount(BOTH_HEADINGS))
  await givenAsync(expect(page.locator('.cm-line', { hasText: LAST_HEADING })).not.toBeInViewport())

  await page.locator('[data-part="outline-list"] button').nth(1).click()

  await expect(page.locator('.cm-line', { hasText: LAST_HEADING })).toBeInViewport()
})

test('the outline follows a preview to the document it shows', async ({ page, request }) => {
  const stamp = String(Date.now())
  await page.goto(await storedDocument(request, `previewed-${stamp}.md`, WITH_HEADINGS))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())
  await page.locator('[data-part="preview-markup"]').click()
  await givenAsync(expect(page.locator('[data-part="markup-body"] h1')).toBeVisible())

  await page.locator('.pane').last().click()
  await page.locator('#show-outline').click()

  await expect(page.locator('[data-part="outline-list"] li')).toHaveText(['Title', 'A section'])
})

test('the outline leaves out a heading the document is only quoting', async ({ page, request }) => {
  const stamp = String(Date.now())
  await page.goto(await storedDocument(request, `outline-quoted-${stamp}.md`, QUOTING_ANOTHER_DOCUMENT))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  await page.locator('#show-outline').click()

  await expect(page.locator('[data-part="outline-list"] li')).toHaveText(['Mine', 'My section'])
})

test('the outline remembers that a reader asked for the quoted ones, across a reload', async ({ page, request }) => {
  const stamp = String(Date.now())
  await page.goto(await storedDocument(request, `outline-remembers-${stamp}.md`, QUOTING_ANOTHER_DOCUMENT))
  await page.locator('#show-outline').click()
  await givenAsync(expect(page.locator('[data-part="outline-list"] li')).toHaveText(['Mine', 'My section']))
  await page.locator('[data-part="outline-quoted"]').click()

  await page.reload()

  await expect(page.locator('[data-part="outline-list"] li')).toHaveText(['Mine', 'Theirs', 'My section'])
})
