'use sanity'

type RejectionMessage = string

const DIALOG_SELECTOR = '#file-dialog'

const CONFIRM_VALUE = 'confirm'

interface PromptRequest {
  title: string
  label: string
  confirmLabel: string
  value?: string
  submit: (value: string) => Promise<RejectionMessage | null>
}

interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
}

interface Choice {
  value: string
  label: string
}

interface ChooseRequest {
  title: string
  message: string
  choices: readonly Choice[]
}

export interface Dialogs {
  prompt: (request: PromptRequest) => Promise<boolean>
  confirm: (request: ConfirmRequest) => Promise<boolean>
  choose: (request: ChooseRequest) => Promise<string | null>
}

interface FieldParts {
  field: HTMLElement
  label: HTMLElement
  input: HTMLInputElement
  error: HTMLElement
}

interface FrameParts {
  dialog: HTMLDialogElement
  title: HTMLElement
  message: HTMLElement
  cancel: HTMLElement
  confirm: HTMLElement
  choices: HTMLElement
}

type Parts = FieldParts & FrameParts

function fieldPartsOf(root: ParentNode): FieldParts | null {
  const field = root.querySelector<HTMLElement>('#file-dialog-field')
  const label = root.querySelector<HTMLElement>('#file-dialog-label')
  const input = root.querySelector<HTMLInputElement>('#file-dialog-entry')
  const error = root.querySelector<HTMLElement>('#file-dialog-error')

  if (field === null || label === null) return null
  if (input === null || error === null) return null

  return { field, label, input, error }
}

function framePartsOf(root: ParentNode): FrameParts | null {
  const dialog = root.querySelector<HTMLDialogElement>(DIALOG_SELECTOR)
  const title = root.querySelector<HTMLElement>('#file-dialog-title')
  const message = root.querySelector<HTMLElement>('#file-dialog-message')
  const cancel = root.querySelector<HTMLElement>('#file-dialog-cancel')
  const confirm = root.querySelector<HTMLElement>('#file-dialog-confirm')
  const choices = root.querySelector<HTMLElement>('#file-dialog-choices')

  if (dialog === null || title === null) return null
  if (message === null || cancel === null) return null
  if (confirm === null || choices === null) return null

  return { dialog, title, message, cancel, confirm, choices }
}

function partsOf(root: ParentNode): Parts | null {
  const field = fieldPartsOf(root)
  const frame = framePartsOf(root)
  if (field === null || frame === null) return null

  return { ...field, ...frame }
}

function bindEnterToConfirm(parts: Parts): void {
  parts.input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    parts.dialog.close(CONFIRM_VALUE)
  })
}

async function settled(dialog: HTMLDialogElement): Promise<string> {
  const closed = Promise.withResolvers<string>()

  dialog.addEventListener(
    'close',
    () => {
      closed.resolve(dialog.returnValue)
    },
    { once: true },
  )

  return await closed.promise
}

function reset(parts: Parts, heading: string, confirmLabel: string): void {
  const { title, error, confirm } = parts

  title.textContent = heading
  error.textContent = ''
  confirm.textContent = confirmLabel
}

async function attempt(parts: Parts, request: PromptRequest): Promise<boolean> {
  const { dialog, input, error } = parts

  const outcome = await settled(dialog)
  if (outcome !== CONFIRM_VALUE) return false

  const failure = await request.submit(input.value.trim())
  if (failure === null) return true

  error.textContent = failure
  dialog.showModal()

  return await attempt(parts, request)
}

async function promptWith(parts: Parts, request: PromptRequest): Promise<boolean> {
  const { dialog, message, field, label, input } = parts
  const { label: fieldLabel } = request

  reset(parts, request.title, request.confirmLabel)
  message.textContent = ''
  label.textContent = fieldLabel
  field.hidden = false
  input.value = request.value ?? ''
  dialog.showModal()

  return await attempt(parts, request)
}

async function confirmWith(parts: Parts, request: ConfirmRequest): Promise<boolean> {
  const { dialog, message, field } = parts
  const { message: text } = request

  reset(parts, request.title, request.confirmLabel)
  message.textContent = text
  field.hidden = true
  dialog.showModal()

  return (await settled(dialog)) === CONFIRM_VALUE
}

function choiceButton(choice: Choice): HTMLButtonElement {
  const { value, label } = choice
  const button = document.createElement('button')
  button.type = 'submit'
  button.className = 'modal__button modal__button--primary'
  button.value = value
  button.textContent = label

  return button
}

async function chooseWith(parts: Parts, request: ChooseRequest): Promise<string | null> {
  const { dialog, message, field, confirm, choices, cancel } = parts
  const { message: text, choices: offered } = request

  reset(parts, request.title, '')
  message.textContent = text
  field.hidden = true
  confirm.hidden = true
  choices.replaceChildren(...offered.map(choiceButton))
  choices.hidden = false
  dialog.showModal()
  cancel.focus()

  const outcome = await settled(dialog)

  choices.replaceChildren()
  choices.hidden = true
  confirm.hidden = false

  return offered.some((choice) => choice.value === outcome) ? outcome : null
}

export function createDialogs(root: ParentNode = document): Dialogs {
  const parts = partsOf(root)
  if (parts !== null) bindEnterToConfirm(parts)

  return {
    async prompt(request: PromptRequest): Promise<boolean> {
      return parts === null ? false : await promptWith(parts, request)
    },

    async confirm(request: ConfirmRequest): Promise<boolean> {
      return parts === null ? false : await confirmWith(parts, request)
    },

    async choose(request: ChooseRequest): Promise<string | null> {
      return parts === null ? null : await chooseWith(parts, request)
    },
  }
}
