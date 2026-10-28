'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { violationsOn } from './axe.ts'
import { storedDocument } from './fixtures.ts'

const BUTTON = '#show-cheatsheet'
const PANEL = '[data-panel="cheatsheet"]'
const SHEET = '[data-part="cheatsheet"]'

async function openCheatsheet(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await givenAsync(expect(page.locator('[data-part="editor"] .cm-content')).toBeVisible())

  await page.locator(BUTTON).click()
  await givenAsync(expect(page.locator(PANEL)).toBeVisible())
}

test('the markdown button opens a cheatsheet beside the document', async ({ page, request }) => {
  await openCheatsheet(page, await storedDocument(request, 'sheet-open.md'))

  await expect(page.locator(SHEET)).toContainText('Writing markdown')
})

test('the cheatsheet is decorated the way the editor decorates a document', async ({ page, request }) => {
  await openCheatsheet(page, await storedDocument(request, 'sheet-styled.md'))

  await expect(page.locator(`${SHEET} .cm-vixen-heading`).first()).toBeVisible()
})

test('the cheatsheet refuses to be typed into', async ({ page, request }) => {
  await openCheatsheet(page, await storedDocument(request, 'sheet-readonly.md'))
  const sheet = page.locator(`${SHEET} .cm-content`)

  await sheet.click()
  await page.keyboard.type('ZZZZ')

  await expect(sheet).not.toContainText('ZZZZ')
})

test('the open cheatsheet has no accessibility violations', async ({ page, request }) => {
  await openCheatsheet(page, await storedDocument(request, 'sheet-a11y.md'))

  expect(await violationsOn(page)).toStrictEqual([])
})

test('opening the cheatsheet leaves the file browser one click away', async ({ page, request }) => {
  await openCheatsheet(page, await storedDocument(request, 'sheet-back.md'))

  await page.locator('#toggle-explorer').click()

  await expect(page.locator('[data-panel="files"]')).toBeVisible()
})
