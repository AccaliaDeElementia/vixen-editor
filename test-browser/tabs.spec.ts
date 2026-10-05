'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

const TAB_SELECTOR = '[data-part="tabs"] [role="tab"]'

test('a kept tab is still in the strip after a reload', async ({ page, request }) => {
  const stamp = String(Date.now())
  const kept = `kept-${stamp}.md`
  const other = `other-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: other, content: '# other' } })

  await page.goto(await storedDocument(request, kept))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${kept}"]`)).toBeVisible())
  await page.locator(`${TAB_SELECTOR}[data-path="${kept}"]`).dblclick()
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${kept}"]`)).not.toHaveClass(/tabs__tab--looking/v))
  await page.locator(`[role="treeitem"][data-path="${other}"]`).click()
  await givenAsync(expect(page).toHaveURL(`/doc/${other}`))

  await page.reload()

  await expect(page.locator(`${TAB_SELECTOR}[data-path="${kept}"]`)).toBeVisible()

  await request.delete(`/api/files/entries/${kept}`)
  await request.delete(`/api/files/entries/${other}`)
})

test('a tab the reader only looked at does not come back after a reload', async ({ page, request }) => {
  const stamp = String(Date.now())
  const looked = `looked-${stamp}.md`
  const other = `elsewhere-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: other, content: '# other' } })

  await page.goto(await storedDocument(request, looked))
  await givenAsync(expect(page.locator(`${TAB_SELECTOR}[data-path="${looked}"]`)).toBeVisible())
  await page.locator(`[role="treeitem"][data-path="${other}"]`).click()
  await givenAsync(expect(page).toHaveURL(`/doc/${other}`))

  await page.reload()

  await expect(page.locator(TAB_SELECTOR)).toHaveCount(1)

  await request.delete(`/api/files/entries/${looked}`)
  await request.delete(`/api/files/entries/${other}`)
})
