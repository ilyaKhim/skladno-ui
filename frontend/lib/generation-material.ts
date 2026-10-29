import type { CreatePresentationInput, ExtractedMaterial, MaterialSource } from './generation-types'

export const MATERIAL_MAX_BYTES = 5 * 1024 * 1024
export const MATERIAL_MAX_CHARACTERS = 30_000

export type MaterialState =
  | { status: 'empty' }
  | { status: 'loading'; requestId: string; name: string }
  | { status: 'error'; requestId: string; name: string; message: string }
  | { status: 'ready'; requestId: string; material: ExtractedMaterial; acknowledged: boolean }

export type MaterialAction =
  | { type: 'start'; requestId: string; name: string }
  | { type: 'loaded'; requestId: string; material: ExtractedMaterial }
  | { type: 'failed'; requestId: string; message: string }
  | { type: 'text'; text: string }
  | { type: 'acknowledge'; value: boolean }
  | { type: 'clear' }

export const EMPTY_MATERIAL: MaterialState = { status: 'empty' }

export function isExtractedMaterial(value: unknown): value is ExtractedMaterial {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return ['pdf', 'docx', 'txt'].includes(item.format as string)
    && typeof item.name === 'string' && item.name.length > 0
    && typeof item.text === 'string'
    && typeof item.characters === 'number' && Number.isInteger(item.characters) && item.characters >= 0
    && (item.pages === null || (typeof item.pages === 'number' && Number.isInteger(item.pages) && item.pages > 0))
    && Array.isArray(item.warnings)
    && item.warnings.every((warning: unknown) => {
      if (!warning || typeof warning !== 'object') return false
      const fields = warning as Record<string, unknown>
      return typeof fields.code === 'string' && typeof fields.message === 'string'
        && (fields.pages === undefined || (Array.isArray(fields.pages)
          && fields.pages.every((page: unknown) => typeof page === 'number' && Number.isInteger(page) && page > 0)))
    })
}

/** Request IDs also reject late responses when a transport ignores cancellation. */
export function materialReducer(state: MaterialState, action: MaterialAction): MaterialState {
  if (action.type === 'clear') return EMPTY_MATERIAL
  if (action.type === 'start')
    return { status: 'loading', requestId: action.requestId, name: action.name }
  if (action.type === 'loaded') {
    if (state.status !== 'loading' || state.requestId !== action.requestId) return state
    return { status: 'ready', requestId: action.requestId, material: action.material, acknowledged: false }
  }
  if (action.type === 'failed') {
    if (state.status !== 'loading' || state.requestId !== action.requestId) return state
    return { ...state, status: 'error', message: action.message }
  }
  if (state.status !== 'ready') return state
  if (action.type === 'text') return { ...state, material: { ...state.material, text: action.text } }
  return { ...state, acknowledged: action.value }
}

export function validateMaterialFile(file: Pick<File, 'name' | 'size'>) {
  if (!/\.(pdf|docx|txt)$/i.test(file.name)) return 'Выберите PDF, DOCX или TXT.'
  if (file.size === 0) return 'Файл пуст. Выберите другой документ.'
  if (file.size > MATERIAL_MAX_BYTES) return 'Файл слишком большой. Максимальный размер — 5 МиБ.'
  return null
}

export function normalizeMaterialText(text: string) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
}

export function materialTextError(text: string) {
  const normalized = normalizeMaterialText(text)
  if (!normalized) return 'Материалы пусты. Добавьте текст или удалите документ.'
  if (normalized.length > MATERIAL_MAX_CHARACTERS)
    return 'В материалах больше 30 000 символов. Сократите текст перед генерацией.'
  return null
}

export function materialRequiresAcknowledgement(material: ExtractedMaterial) {
  return material.warnings.some((warning) => warning.code === 'pdf_pages_without_text')
}

export function materialCanGenerate(state: MaterialState) {
  return state.status === 'empty' || (
    state.status === 'ready'
    && !materialTextError(state.material.text)
    && (!materialRequiresAcknowledgement(state.material) || state.acknowledged)
  )
}

export function materialSource(state: MaterialState): MaterialSource | undefined {
  if (state.status !== 'ready' || !materialCanGenerate(state)) return undefined
  return { format: state.material.format, name: state.material.name, text: normalizeMaterialText(state.material.text) }
}

export type CreationAttempt = { fingerprint: string; key: string }

/** A retry of an unchanged payload must not enqueue a second paid generation. */
export function creationAttempt(
  input: CreatePresentationInput,
  previous: CreationAttempt | null,
  newKey: () => string = () => crypto.randomUUID(),
): CreationAttempt {
  const fingerprint = JSON.stringify(input)
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: newKey() }
}
