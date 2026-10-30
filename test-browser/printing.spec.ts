'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

const SHEET = '[data-part="print-sheet"]'
const A_DOCUMENT = '# Printed heading\n\nwith prose and a [link](other.md).\n'

async function printing(page: Page): Promise<void> {
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'))
  })
}

async function colourOf(page: Page, selector: string, property: string): Promise<string> {
  return await page
    .locator(selector)
    .evaluate((element, named) => window.getComputedStyle(element).getPropertyValue(named), property)
}

test('printing shows the document and none of the application', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `print-${String(Date.now())}.md`, A_DOCUMENT))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  await printing(page)

  await expect(page.locator('.ribbon')).toBeHidden()
})

test('printing puts the rendered document on the page, not its markup', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `printed-${String(Date.now())}.md`, A_DOCUMENT))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  await printing(page)

  await expect(page.locator(`${SHEET} h1`)).toHaveText('Printed heading')
})

test('printing is black on white, whatever the screen was', async ({ page, request }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(await storedDocument(request, `printdark-${String(Date.now())}.md`, A_DOCUMENT))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  await printing(page)

  expect([await colourOf(page, SHEET, 'color'), await colourOf(page, SHEET, 'background-color')]).toStrictEqual([
    'rgb(0, 0, 0)',
    'rgb(255, 255, 255)',
  ])
})

test('the sheet holds nothing while the reader is only looking at the screen', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `printidle-${String(Date.now())}.md`, A_DOCUMENT))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  await expect(page.locator(SHEET)).toBeEmpty()
})
