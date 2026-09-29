'use sanity'

import { givenAsync } from '../conditions.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDialogs } from '../../src/client/files/dialogs.ts'

function page(): void {
  document.body.innerHTML = `
    <dialog id="file-dialog">
      <form method="dialog">
        <h2 id="file-dialog-title"></h2>
        <p id="file-dialog-message"></p>
        <p id="file-dialog-field">
          <label id="file-dialog-label" for="file-dialog-entry">Name</label>
          <input id="file-dialog-entry" type="text">
        </p>
        <p id="file-dialog-error"></p>
        <div id="file-dialog-choices" hidden></div>
        <div id="file-dialog-body" hidden tabindex="0"></div>
        <button id="file-dialog-cancel" type="submit" value="cancel">Cancel</button>
        <button id="file-dialog-confirm" type="submit" value="confirm"></button>
      </form>
    </dialog>`
}

function dialog(): HTMLDialogElement {
  const element = document.querySelector<HTMLDialogElement>('#file-dialog')
  if (element === null) throw new Error('missing dialog')
  return element
}

function type(value: string): void {
  const input = document.querySelector<HTMLInputElement>('#file-dialog-entry')
  if (input === null) throw new Error('missing input')
  input.value = value
}

function click(selector: string): void {
  document.querySelector<HTMLButtonElement>(selector)?.click()
}

function errorText(): string {
  return document.querySelector('#file-dialog-error')?.textContent ?? ''
}

beforeEach(() => {
  page()
})

describe('prompt', () => {
  it('resolves true once the submission succeeds', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({
      title: 'New',
      label: 'Name',
      confirmLabel: 'Create',
      submit: () => Promise.resolve(null),
    })

    type('notes.md')
    click('#file-dialog-confirm')

    await expect(pending).resolves.toBe(true)
  })

  it('hands the typed value to the submission, trimmed', async () => {
    const submit = vi.fn().mockResolvedValue(null)
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit })

    type('  notes.md  ')
    click('#file-dialog-confirm')
    await pending

    expect(submit).toHaveBeenCalledWith('notes.md')
  })

  it('resolves false on cancel', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit: vi.fn() })

    click('#file-dialog-cancel')

    await expect(pending).resolves.toBe(false)
  })

  it('submits nothing when it is cancelled', async () => {
    const submit = vi.fn()
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit })

    click('#file-dialog-cancel')
    await givenAsync(pending)

    expect(submit).not.toHaveBeenCalled()
  })

  it.each([
    ['the title', '#file-dialog-title', 'New folder'],
    ['the confirm label', '#file-dialog-confirm', 'Create'],
  ])('shows %s it was given', (_label, selector, expected) => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({
      title: 'New folder',
      label: 'Name',
      confirmLabel: 'Create',
      submit: () => Promise.resolve(null),
    })

    expect(document.querySelector(selector)?.textContent).toBe(expected)
  })

  it('opens the dialog modally', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit: () => Promise.resolve(null) })

    expect(dialog().open).toBe(true)
  })

  it('stays open and shows the reason when the submission is rejected', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({
      title: 'New',
      label: 'Name',
      confirmLabel: 'Create',
      submit: (value) => Promise.resolve(value === 'taken.md' ? 'Already exists' : null),
    })

    type('taken.md')
    click('#file-dialog-confirm')
    await givenAsync(
      vi.waitFor(() => {
        expect(errorText()).toBe('Already exists')
      }),
    )

    expect(dialog().open).toBe(true)

    type('free.md')
    click('#file-dialog-confirm')
    await givenAsync(expect(pending).resolves.toBe(true))
  })

  it('clears a stale error when it opens again', async () => {
    const dialogs = createDialogs(document)
    const first = dialogs.prompt({
      title: 'New',
      label: 'Name',
      confirmLabel: 'Create',
      submit: () => Promise.resolve('nope'),
    })
    type('a.md')
    click('#file-dialog-confirm')
    await givenAsync(
      vi.waitFor(() => {
        expect(errorText()).toBe('nope')
      }),
    )
    click('#file-dialog-cancel')
    await first

    void dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit: () => Promise.resolve(null) })

    expect(errorText()).toBe('')
  })

  it('labels the field with what it is asking for, not a bare "Name"', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({
      title: 'New folder',
      label: 'Folder name',
      confirmLabel: 'Create',
      submit: () => Promise.resolve(null),
    })

    expect(document.querySelector('#file-dialog-label')?.textContent).toBe('Folder name')
  })

  it('shows the name field', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit: () => Promise.resolve(null) })

    expect(document.querySelector<HTMLElement>('#file-dialog-field')?.hidden).toBe(false)
  })

  it('starts from a given value', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({
      title: 'Rename',
      label: 'Name',
      confirmLabel: 'Rename',
      value: 'old.md',
      submit: () => Promise.resolve(null),
    })

    expect(document.querySelector<HTMLInputElement>('#file-dialog-entry')?.value).toBe('old.md')
  })
})

describe('confirm', () => {
  it('resolves true when confirmed', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.confirm({ title: 'Delete', message: 'Sure?', confirmLabel: 'Delete' })

    click('#file-dialog-confirm')

    await expect(pending).resolves.toBe(true)
  })

  it('resolves false when cancelled', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.confirm({ title: 'Delete', message: 'Sure?', confirmLabel: 'Delete' })

    click('#file-dialog-cancel')

    await expect(pending).resolves.toBe(false)
  })

  it('shows the message it was given', () => {
    const dialogs = createDialogs(document)
    void dialogs.confirm({ title: 'Delete', message: 'notes.md will go to the trash', confirmLabel: 'Delete' })

    expect(document.querySelector('#file-dialog-message')?.textContent).toBe('notes.md will go to the trash')
  })

  it('hides the name field, since there is nothing to type', () => {
    const dialogs = createDialogs(document)
    void dialogs.confirm({ title: 'Delete', message: 'notes.md will go to the trash', confirmLabel: 'Delete' })

    expect(document.querySelector<HTMLElement>('#file-dialog-field')?.hidden).toBe(true)
  })
})

const RESOLUTIONS = [
  { value: 'theirs', label: 'Use the version on disk' },
  { value: 'mine', label: 'Overwrite with mine' },
  { value: 'copy', label: 'Save mine as a copy' },
]

function choiceLabels(): string[] {
  return [...document.querySelectorAll('#file-dialog-choices button')].map((button) => button.textContent)
}

describe('choose', () => {
  it('resolves the value of the button that was pressed', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.choose({ title: 'Conflict', message: 'It changed', choices: RESOLUTIONS })

    click('#file-dialog-choices button:nth-child(2)')

    await expect(pending).resolves.toBe('mine')
  })

  it('resolves null when cancelled', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.choose({ title: 'Conflict', message: 'It changed', choices: RESOLUTIONS })

    click('#file-dialog-cancel')

    await expect(pending).resolves.toBeNull()
  })

  it('renders one button per choice, in the order given', () => {
    const dialogs = createDialogs(document)
    void dialogs.choose({ title: 'Conflict', message: 'It changed', choices: RESOLUTIONS })

    expect(choiceLabels()).toStrictEqual(['Use the version on disk', 'Overwrite with mine', 'Save mine as a copy'])
  })

  it('shows the message it was given', () => {
    const dialogs = createDialogs(document)
    void dialogs.choose({ title: 'Conflict', message: 'notes.md changed on disk', choices: RESOLUTIONS })

    expect(document.querySelector('#file-dialog-message')?.textContent).toBe('notes.md changed on disk')
  })

  it('swaps the field and the single confirm button for the choices', () => {
    const dialogs = createDialogs(document)
    void dialogs.choose({ title: 'Conflict', message: 'notes.md changed on disk', choices: RESOLUTIONS })

    expect({
      fieldHidden: document.querySelector<HTMLElement>('#file-dialog-field')?.hidden,
      confirmHidden: document.querySelector<HTMLElement>('#file-dialog-confirm')?.hidden,
      choicesHidden: document.querySelector<HTMLElement>('#file-dialog-choices')?.hidden,
    }).toStrictEqual({ fieldHidden: true, confirmHidden: true, choicesHidden: false })
  })

  it('opens the dialog modally', () => {
    const dialogs = createDialogs(document)
    void dialogs.choose({ title: 'Conflict', message: 'It changed', choices: RESOLUTIONS })

    expect(dialog().open).toBe(true)
  })

  it('opens with Cancel focused, so Enter cannot discard work by reflex', () => {
    const dialogs = createDialogs(document)
    void dialogs.choose({ title: 'Conflict', message: 'It changed', choices: RESOLUTIONS })

    expect(document.activeElement?.id).toBe('file-dialog-cancel')
  })

  it('leaves the dialog fit for an ordinary confirm afterwards', async () => {
    const dialogs = createDialogs(document)
    const chosen = dialogs.choose({ title: 'Conflict', message: 'It changed', choices: RESOLUTIONS })
    click('#file-dialog-cancel')
    await chosen

    void dialogs.confirm({ title: 'Delete', message: 'Sure?', confirmLabel: 'Delete' })

    expect({
      labels: choiceLabels(),
      choicesHidden: document.querySelector<HTMLElement>('#file-dialog-choices')?.hidden,
      confirmHidden: document.querySelector<HTMLElement>('#file-dialog-confirm')?.hidden,
    }).toStrictEqual({ labels: [], choicesHidden: true, confirmHidden: false })
  })
})

const REQUIRED_IDS = [
  'file-dialog',
  'file-dialog-title',
  'file-dialog-message',
  'file-dialog-field',
  'file-dialog-label',
  'file-dialog-entry',
  'file-dialog-error',
  'file-dialog-cancel',
  'file-dialog-confirm',
  'file-dialog-choices',
  'file-dialog-body',
]

const HELP = [
  { heading: 'Keyboard', entries: [{ does: 'Save', how: 'Ctrl/Cmd + S' }] },
  { heading: 'Markdown', entries: [{ does: 'Heading', how: '# Title' }] },
]

describe('inform', () => {
  it('lists every section it was given', () => {
    const dialogs = createDialogs(document)
    void dialogs.inform({ title: 'Help', closeLabel: 'Close', sections: HELP })

    expect([...document.querySelectorAll('#file-dialog-body h3')].map((h) => h.textContent)).toStrictEqual([
      'Keyboard',
      'Markdown',
    ])
  })

  it('pairs each thing with how it is done', () => {
    const dialogs = createDialogs(document)
    void dialogs.inform({ title: 'Help', closeLabel: 'Close', sections: HELP })

    expect({
      term: document.querySelector('#file-dialog-body dt')?.textContent,
      description: document.querySelector('#file-dialog-body dd')?.textContent,
    }).toStrictEqual({ term: 'Save', description: 'Ctrl/Cmd + S' })
  })

  it('offers one way out, since there is nothing to decide', () => {
    const dialogs = createDialogs(document)
    void dialogs.inform({ title: 'Help', closeLabel: 'Close', sections: HELP })

    expect(document.querySelector<HTMLElement>('#file-dialog-cancel')?.hidden).toBe(true)
  })

  it('labels that way out as it was asked to', () => {
    const dialogs = createDialogs(document)
    void dialogs.inform({ title: 'Help', closeLabel: 'Close', sections: HELP })

    expect(document.querySelector('#file-dialog-confirm')?.textContent).toBe('Close')
  })

  it('resolves when it is closed', async () => {
    const dialogs = createDialogs(document)
    const shown = dialogs.inform({ title: 'Help', closeLabel: 'Close', sections: HELP })

    click('#file-dialog-confirm')

    await expect(shown).resolves.toBeUndefined()
  })

  it('leaves the dialog fit for the next use', async () => {
    const dialogs = createDialogs(document)
    const shown = dialogs.inform({ title: 'Help', closeLabel: 'Close', sections: HELP })

    click('#file-dialog-confirm')
    await givenAsync(shown)

    expect({
      sections: document.querySelectorAll('#file-dialog-body h3').length,
      bodyHidden: document.querySelector<HTMLElement>('#file-dialog-body')?.hidden,
      cancelHidden: document.querySelector<HTMLElement>('#file-dialog-cancel')?.hidden,
    }).toStrictEqual({ sections: 0, bodyHidden: true, cancelHidden: false })
  })
})

describe('a page missing one part of the dialog', () => {
  it.each(REQUIRED_IDS)('declines rather than throwing when #%s is absent', async (id) => {
    document.querySelector(`#${id}`)?.remove()

    await expect(
      createDialogs(document).prompt({
        title: 'x',
        label: 'y',
        confirmLabel: 'z',
        submit: () => Promise.resolve(null),
      }),
    ).resolves.toBe(false)
  })
})

describe('a page without the dialog markup', () => {
  it('declines a prompt rather than throwing', async () => {
    document.body.innerHTML = '<p>nothing here</p>'

    await expect(
      createDialogs(document).prompt({
        title: 'x',
        label: 'y',
        confirmLabel: 'z',
        submit: () => Promise.resolve(null),
      }),
    ).resolves.toBe(false)
  })

  it('declines a confirm rather than throwing', async () => {
    document.body.innerHTML = '<p>nothing here</p>'

    await expect(createDialogs(document).confirm({ title: 'x', message: 'y', confirmLabel: 'z' })).resolves.toBe(false)
  })

  it('shows no help rather than throwing', async () => {
    document.body.innerHTML = '<p>nothing here</p>'

    await expect(
      createDialogs(document).inform({ title: 'x', closeLabel: 'Close', sections: HELP }),
    ).resolves.toBeUndefined()
  })

  it('declines a choice rather than throwing', async () => {
    document.body.innerHTML = '<p>nothing here</p>'

    await expect(createDialogs(document).choose({ title: 'x', message: 'y', choices: RESOLUTIONS })).resolves.toBeNull()
  })
})

describe('closing without a form', () => {
  it('confirms when Enter is pressed in the field', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({
      title: 'New',
      label: 'Name',
      confirmLabel: 'Create',
      submit: () => Promise.resolve(null),
    })

    type('notes.md')
    document
      .querySelector('#file-dialog-entry')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

    await expect(pending).resolves.toBe(true)
  })

  it('ignores other keys in the field', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit: () => Promise.resolve(null) })

    document
      .querySelector('#file-dialog-entry')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))

    expect(dialog().open).toBe(true)
  })
})
