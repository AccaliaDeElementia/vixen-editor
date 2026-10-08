'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.join(import.meta.dirname, '..', '..')
const BOOTSTRAP = 'src/client/editor/bootstrap.ts'
const HALF = /function teardown(?<half>Document|Application)\(\): void \{(?<body>[\s\S]*?)\n {2}\}/gv
const CALLED = /^\s*(?<name>[A-Za-z][\w.]*)\(\)/gmv
const BOTH_HALVES = 2

const PER_DOCUMENT = [
  'aside.forget',
  'dismissals.offSplitDismissRequested',
  'emptied.offTrashEmptied',
  'offDocumentMoved',
  'offInsertRequested',
  'offKeepRequested',
  'offOpenAsideRequested',
  'previews.stop',
  'splitChanges.offSplitChanged',
  'stopFollowingDeletion',
  'tab.teardownDocument',
  'toast.dismissRaised',
]

const PER_APPLICATION = ['changes.disconnect', 'navigator.stopIntercepting', 'unbindTabKeys', 'unguardUnload']

async function halves(): Promise<Map<string, string[]>> {
  const source = await fs.readFile(path.join(REPO_ROOT, BOOTSTRAP), 'utf8')
  const found = new Map<string, string[]>()

  for (const match of source.matchAll(HALF)) {
    const { half, body } = match.groups ?? {}
    if (half === undefined || body === undefined) continue

    found.set(half, [...body.matchAll(CALLED)].map((call) => call.groups?.name ?? '').sort())
  }

  return found
}

describe('the two teardown halves hold what each is declared to hold', () => {
  it('tears down exactly the document-scoped work when a document closes', async () => {
    expect((await halves()).get('Document')).toStrictEqual(PER_DOCUMENT)
  })

  it('tears down exactly the application-scoped work when the editor goes', async () => {
    expect((await halves()).get('Application')).toStrictEqual(PER_APPLICATION)
  })

  it('found both halves, so the comparisons are not passing vacuously', async () => {
    expect((await halves()).size).toBe(BOTH_HALVES)
  })
})
