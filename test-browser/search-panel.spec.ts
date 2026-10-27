'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { violationsOn } from './axe.ts'
import { storedDocument } from './fixtures.ts'

const PANEL = '.cm-search'
const FIND = 'ControlOrMeta+f'

async function openSearch(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  await page.locator('.cm-content').click()
  await page.keyboard.press(FIND)
  await givenAsync(expect(page.locator(PANEL)).toBeVisible())
}

async function panelColours(page: Page): Promise<{ panel: string; field: string }> {
  return await page.evaluate(() => {
    const panel = document.querySelector('.cm-panels')
    const field = document.querySelector('.cm-textfield')

    return {
      panel: panel === null ? '' : getComputedStyle(panel).backgroundColor,
      field: field === null ? '' : getComputedStyle(field).color,
    }
  })
}

test('the search panel follows the colour scheme rather than staying dark on a light page', async ({
  page,
  request,
}) => {
  await openSearch(page, await storedDocument(request, 'search-scheme.md', '# A heading\n\nsome prose\n'))

  await page.emulateMedia({ colorScheme: 'dark' })
  const dark = await panelColours(page)
  await page.emulateMedia({ colorScheme: 'light' })
  const light = await panelColours(page)

  expect(light.panel).not.toBe(dark.panel)
})

test('the search panel writes its own text in a colour that changes with the scheme', async ({ page, request }) => {
  await openSearch(page, await storedDocument(request, 'search-ink.md', '# A heading\n\nsome prose\n'))

  await page.emulateMedia({ colorScheme: 'dark' })
  const dark = await panelColours(page)
  await page.emulateMedia({ colorScheme: 'light' })
  const light = await panelColours(page)

  expect(light.field).not.toBe(dark.field)
})

test('the open search panel has no accessibility violations', async ({ page, request }) => {
  await openSearch(page, await storedDocument(request, 'search-a11y.md', '# A heading\n\nsome prose\n'))

  expect(await violationsOn(page)).toStrictEqual([])
})
