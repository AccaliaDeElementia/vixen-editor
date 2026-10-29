'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

import { storedDocument } from './fixtures.ts'
import { violationsOn } from './axe.ts'

const WITH_HEADINGS = '# Title\n\nsome prose\n\n## A section\n\nmore prose\n'

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
