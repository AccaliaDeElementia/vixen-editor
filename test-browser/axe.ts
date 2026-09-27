'use sanity'

import path from 'node:path'

import type { Page } from '@playwright/test'

const AXE_SOURCE = path.resolve(import.meta.dirname, '..', 'node_modules', 'axe-core', 'axe.min.js')

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const ALSO_ENFORCED = ['landmark-one-main', 'page-has-heading-one']

interface AxeViolation {
  id: string
  help: string
  nodes: unknown[]
}

declare global {
  interface Window {
    axe: { run: (options: unknown) => Promise<{ violations: AxeViolation[] }> }
  }
}

export async function violationsOn(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE_SOURCE })

  return await page.evaluate(
    async ({ tags, rules }) => {
      const describe = (violations: AxeViolation[]): string[] =>
        violations.map((violation) => `${violation.id} (${String(violation.nodes.length)}): ${violation.help}`)

      const byTag = await window.axe.run({ runOnly: { type: 'tag', values: tags } })
      const byName = await window.axe.run({ runOnly: { type: 'rule', values: rules } })

      return [...describe(byTag.violations), ...describe(byName.violations)]
    },
    { tags: WCAG_TAGS, rules: ALSO_ENFORCED },
  )
}
