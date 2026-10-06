'use sanity'

import { given, givenAsync } from '../test/conditions.ts'
import { expect, test } from './store-server.ts'

test('ctrl-clicking a link in the document opens it', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `links-${stamp}`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/documents', { data: { path: `${folder}/target.md`, content: '# the target' } })
  await request.post('/api/files/documents', {
    data: { path: `${folder}/source.md`, content: 'see [the target](target.md) for more' },
  })

  await page.goto(`/doc/${folder}/source.md`)

  const link = page.locator('.cm-vixen-link')
  await givenAsync(expect(link).toHaveAttribute('title', `Ctrl/Cmd+click to open ${folder}/target.md`))

  await link.click({ modifiers: ['ControlOrMeta'] })

  await givenAsync(expect(page.locator('.cm-content')).toContainText('# the target'))
  expect(new URL(page.url()).pathname).toBe(`/doc/${folder}/target.md`)

  await request.delete(`/api/files/entries/${folder}`)
})

test('a moved document still links to the same file, and says so', async ({ page, request }) => {
  const stamp = String(Date.now())
  const folder = `held-${stamp}`
  const moved = `moved-${stamp}`
  await request.post('/api/files/folders', { data: { path: folder } })
  await request.post('/api/files/folders', { data: { path: moved } })
  await request.post('/api/files/documents', { data: { path: `${folder}/target.md`, content: '# the target' } })
  await request.post('/api/files/documents', {
    data: { path: `${folder}/source.md`, content: 'see [the target](target.md) for more' },
  })

  await page.goto(`/doc/${folder}/source.md`)
  const link = page.locator('.cm-vixen-link')
  await givenAsync(expect(link).toHaveAttribute('title', `Ctrl/Cmd+click to open ${folder}/target.md`))
  await givenAsync(expect(link).toHaveAttribute('data-destination', 'target.md'))

  await page
    .locator(`[role="treeitem"][data-path="${folder}/source.md"]`)
    .dragTo(page.locator(`[role="treeitem"][data-path="${moved}"]`))
  await givenAsync(
    expect(page.locator('[data-part="tabs"] [role="tab"][aria-selected="true"]')).toHaveAttribute(
      'data-path',
      `${moved}/source.md`,
    ),
  )

  await givenAsync(expect(link).toHaveAttribute('data-destination', `../${folder}/target.md`))
  await expect(link).toHaveAttribute('title', `Ctrl/Cmd+click to open ${folder}/target.md`)

  await request.delete(`/api/files/entries/${folder}`)
  await request.delete(`/api/files/entries/${moved}`)
})

test('a plain click on a link only moves the caret', async ({ page, request }) => {
  const stamp = String(Date.now())
  const name = `plainlink-${stamp}.md`
  await request.post('/api/files/documents', { data: { path: name, content: 'see [a](other.md)' } })

  await page.goto(`/doc/${name}`)
  await page.locator('.cm-vixen-link').click()

  given(() => {
    expect(new URL(page.url()).pathname).toBe(`/doc/${name}`)
  })
  await expect(page.locator('.cm-content')).toContainText('see [a](other.md)')

  await request.delete(`/api/files/entries/${name}`)
})

test('an external link in the document is not decorated', async ({ page, request }) => {
  const name = `external-${String(Date.now())}.md`
  await request.post('/api/files/documents', { data: { path: name, content: '[out](https://example.test/a.md)' } })

  await page.goto(`/doc/${name}`)
  await givenAsync(expect(page.locator('.cm-content')).toContainText('example.test'))

  await expect(page.locator('.cm-vixen-link')).toHaveCount(0)

  await request.delete(`/api/files/entries/${name}`)
})
