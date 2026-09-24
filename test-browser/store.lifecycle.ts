'use sanity'

import { expect, test } from '@playwright/test'

import { emptyDocsRoot, entriesInDocsRoot } from './docs-root.ts'

async function emptyTheStore(): Promise<void> {
  await emptyDocsRoot()

  expect(await entriesInDocsRoot()).toStrictEqual([])
}

test('the document store starts empty', { tag: '@setup' }, emptyTheStore)
test('the document store is left empty', { tag: '@teardown' }, emptyTheStore)
