'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

const PROSE_AND_MARKUP = 'A wrod here and `wrod` in code.\n\n[a label](jrnl/entrie.md)\n'

async function opened(page: Page, request: Page['request'], name: string): Promise<void> {
  await page.goto(await storedDocument(request, name, PROSE_AND_MARKUP))
  await givenAsync(expect(page.locator('.cm-content')).toContainText('wrod'))
}

test('the editor asks for the reader’s own spell checker', async ({ page, request }) => {
  await opened(page, request, `asks-${String(Date.now())}.md`)

  await expect(page.locator('.cm-content')).toHaveAttribute('spellcheck', 'true')
})

test('it leaves autocorrect off, because a list marker is not a sentence to be fixed', async ({ page, request }) => {
  await opened(page, request, `uncorrected-${String(Date.now())}.md`)

  await expect(page.locator('.cm-content')).toHaveAttribute('autocorrect', 'off')
})

test('it keeps the checker off the markup, which is paths and identifiers rather than words', async ({
  page,
  request,
}) => {
  await opened(page, request, `scoped-${String(Date.now())}.md`)

  const skipped = await page.locator('.cm-content [spellcheck="false"]').allTextContents()

  expect(skipped).toStrictEqual(['`wrod`', 'jrnl/entrie.md'])
})

test('a correction accepted in the page reaches the document, not only the markup it was made in', async ({
  page,
  request,
}) => {
  const name = `corrected-${String(Date.now())}.md`
  await opened(page, request, name)
  await givenAsync(
    page.evaluate(() => {
      const content = document.querySelector('.cm-content')
      if (content === null) return

      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node !== null) {
        if (node instanceof Text && node.data.includes('A wrod here')) {
          node.data = node.data.replace('wrod', 'word')
        }
        node = walker.nextNode()
      }
    }),
  )

  await page.keyboard.press('Control+s')

  await expect
    .poll(async () => await (await request.get(`/api/documents/${name}`)).text())
    .toContain('A word here and `wrod` in code.')
})
