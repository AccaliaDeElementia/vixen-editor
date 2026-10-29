'use sanity'

import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

async function searched(page: Page, typed: string): Promise<void> {
  await page.locator('#show-search').click()
  await page.locator('[data-part="search-field"]').fill(typed)
  await page.locator('[data-part="search-field"]').press('Enter')
}

test('a search finds a document the reader does not have open', async ({ page, request }) => {
  const stamp = String(Date.now())
  const wanted = `lantern-${stamp}`
  await request.post('/api/files/documents', {
    data: { path: `elsewhere-${stamp}.md`, content: `# Elsewhere\n\nthe ${wanted} went out\n` },
  })
  await page.goto(await storedDocument(request, `here-${stamp}.md`, '# Here\n'))

  await searched(page, wanted.toUpperCase())

  await expect(page.locator('[data-part="search-results"] li')).toHaveText([
    `elsewhere-${stamp}.md:3the ${wanted} went out`,
  ])
})

test('a search that matches nothing says so, rather than leaving the panel blank', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `nomatch-${String(Date.now())}.md`, '# Here\n'))

  await searched(page, 'zzz-nothing-matches-this')

  await expect(page.locator('[data-part="search-said"]')).toHaveText('No matches')
})

test('asking for the search panel puts the caret in its field, ready to type', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `focus-${String(Date.now())}.md`))

  await page.locator('#show-search').click()

  await expect(page.locator('[data-part="search-field"]')).toBeFocused()
})
