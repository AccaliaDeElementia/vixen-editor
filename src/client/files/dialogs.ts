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

export interface Dialogs {
  prompt: (request: PromptRequest) => Promise<boolean>
  confirm: (request: ConfirmRequest) => Promise<boolean>
}

interface Parts {
  dialog: HTMLDialogElement
  title: HTMLElement
  message: HTMLElement
  field: HTMLElement
  label: HTMLElement
  input: HTMLInputElement
  error: HTMLElement
  cancel: HTMLElement
  confirm: HTMLElement
}

function partsOf(root: ParentNode): Parts | null {
  const dialog = root.querySelector<HTMLDialogElement>(DIALOG_SELECTOR)
  const title = root.querySelector<HTMLElement>('#file-dialog-title')
  const message = root.querySelector<HTMLElement>('#file-dialog-message')
  const field = root.querySelector<HTMLElement>('#file-dialog-field')
  const label = root.querySelector<HTMLElement>('#file-dialog-label')
  const input = root.querySelector<HTMLInputElement>('#file-dialog-entry')
  const error = root.querySelector<HTMLElement>('#file-dialog-error')
  const cancel = root.querySelector<HTMLElement>('#file-dialog-cancel')
  const confirm = root.querySelector<HTMLElement>('#file-dialog-confirm')

  if (dialog === null || title === null || message === null || field === null) return null
  if (label === null || input === null || error === null) return null
  if (cancel === null || confirm === null) return null

  return { dialog, title, message, field, label, input, error, cancel, confirm }
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
  }
}
