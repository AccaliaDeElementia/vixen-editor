'use sanity'

import { givenAsync } from '../test/conditions.ts'
import { expect, test } from '@playwright/test'

import { storedDocument } from './fixtures.ts'

test('the title names the last two path segments', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'titled.md'))

  await expect(page).toHaveTitle('titled.md')
})

test('counts the words in the open document', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'status.md', '# one two three'))

  await givenAsync(expect(page.locator('#open-path')).toHaveText('status.md'))

  await expect(page.locator('#word-count')).toHaveText('4 words')
})

test('the word count follows what is typed', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'counting.md', 'seed'))
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('alpha beta gamma')

  await expect(page.locator('#word-count')).toHaveText('3 words')
})

test('an edit starts a countdown bar that shrinks', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'countdown.md', 'seed'))
  await page.locator('.cm-content').click()
  await page.keyboard.type(' edited')

  await givenAsync(expect(page.locator('#save-label')).toHaveText('Save pending'))

  const bar = page.locator('#save-countdown')
  const width = async (): Promise<number> => (await bar.boundingBox())?.width ?? 0

  const started = await width()
  await expect.poll(width, { timeout: 4000 }).toBeLessThan(started)
})

const UNAMBIGUOUSLY_SHRUNK = 0.95

test('a further edit restarts the countdown rather than letting it run down', async ({ page, request }) => {
  await page.goto(await storedDocument(request, 'restart.md', 'seed'))
  await page.locator('.cm-content').click()
  await page.keyboard.type(' first')

  const bar = page.locator('#save-countdown')
  const width = async (): Promise<number> => (await bar.boundingBox())?.width ?? 0

  const started = await width()
  await givenAsync(expect.poll(width, { timeout: 4000 }).toBeLessThan(started * UNAMBIGUOUSLY_SHRUNK))
  const shrunk = await width()

  await page.keyboard.type(' second')

  await expect.poll(width, { timeout: 4000 }).toBeGreaterThan(shrunk)
})
