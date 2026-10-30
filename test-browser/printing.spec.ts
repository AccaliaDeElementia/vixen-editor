'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'
import type { Page } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

const SHEET = '[data-part="print-sheet"]'
const A_DOCUMENT = '# Printed heading\n\nwith prose and a [link](other.md).\n'
const PARAGRAPHS_PAST_ONE_PAGE = 200
const LONGER_THAN_A_PAGE = `# Title\n\n${'Filler prose that carries on for a while.\n\n'.repeat(PARAGRAPHS_PAST_ONE_PAGE)}`
const ONE_PAGE = 1

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

test('the editing bar offers printing, which a reader with no keyboard cannot ask for otherwise', async ({
  page,
  request,
}) => {
  await page.goto(await storedDocument(request, `printbutton-${String(Date.now())}.md`, A_DOCUMENT))

  await expect(page.locator('[data-part="print-document"]')).toHaveAttribute('title', 'Print the document')
})

test('a long document prints whole, rather than clipped to what the window showed', async ({ page, request }) => {
  await page.goto(await storedDocument(request, `printlong-${String(Date.now())}.md`, LONGER_THAN_A_PAGE))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  await printing(page)

  const reach = await page.evaluate(() => ({
    page: document.documentElement.scrollHeight,
    sheet: Math.round(document.querySelector('[data-part="print-sheet"]')?.getBoundingClientRect().height ?? 0),
  }))

  expect(reach.page).toBeGreaterThanOrEqual(reach.sheet)
})

test('the paper it would produce runs to more than one page', async ({ page, request, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chromium renders the paper this asks to see')
  await page.goto(await storedDocument(request, `printpaper-${String(Date.now())}.md`, LONGER_THAN_A_PAGE))
  await givenAsync(expect(page.locator('.cm-content')).toBeVisible())

  await printing(page)

  const paper = await page.pdf()

  expect([...paper.toString('latin1').matchAll(/\/Type\s*\/Page[^s]/gv)].length).toBeGreaterThan(ONE_PAGE)
})
