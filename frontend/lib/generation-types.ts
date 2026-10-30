export type Template = {
  id: string
  name: string
  description: string
  available_slides: number
  preview_url: string
}
export type ModelOption = { id: string; name: string }
export type MaterialSource = {
  format: 'pdf' | 'docx' | 'txt'
  name: string
  text: string
}
export type ExtractedMaterial = MaterialSource & {
  characters: number
  pages: number | null
  warnings: { code: string; message: string; pages?: number[] }[]
}
export type GenerationContext = {
  goal?: string
  audience?: string
  source?: MaterialSource
}
export type CreatePresentationInput = GenerationContext & {
  template_id: string
  topic: string
  mode: 'openai' | 'manual'
  model?: string
}
export type Revision = {
  version: number
  message: string
  reply: string
  model: string
  download_url: string
}
export type PresentationJob = {
  id: string
  template_id: string
  topic: string
  mode: 'manual' | 'openai'
  status: 'awaiting_content' | 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  error_code: string | null
  slide_count: number | null
  download_url: string | null
  /** Unix timestamp in seconds, as returned by the presentations API. */
  created_at: number
  version: number
  model: string | null
}
export type MaterialJob = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  result: ExtractedMaterial | null
  error: { code: string; message: string } | null
}
export type TemplateContext = {
  fields: Record<string, number>
  slides: { slide: number; fields: string[] }[]
}
export type AiCall = {
  id: string
  operation: 'generation' | 'chat' | 'text_edit'
  model: string
  request_body: string
  response_body: string | null
  http_status: number | null
  error_code: string | null
  /** Unix timestamps in milliseconds, preserving AI call timing. */
  started_at: number
  completed_at: number | null
  duration_ms: number | null
}

type EditorTextBlock = {
  id: string
  field_key: string | null
  layout_id: string | null
  max_chars: number
  /** Hard save limit; absent on backends released before AI text edits. */
  hard_max_chars?: number
  role: 'eyebrow' | 'title' | 'subtitle' | 'body' | 'metric' | 'caption'
  text: string
  x: number
  y: number
  width: number
  height: number
  font_size: number
  weight: 400 | 500 | 700
  align: 'left' | 'center' | 'right'
  color: 'ink' | 'muted' | 'brand'
  font_color: string | null
  paragraph: {
    index: number
    bullet: string | null
    bullet_color: string | null
    line_height: number | null
    space_before: number
    space_after: number
    left_margin: number
    indent: number
  } | null
}

type EditorSlide = {
  id: string
  source_slide_number: number
  name: string
  theme: 'paper' | 'navy'
  background_url: string
  hidden: boolean
  blocks: EditorTextBlock[]
  images: EditorImageBlock[]
}

type EditorImageBlock = {
  id: string
  asset_id: string
  url: string
  alt: string
  x: number
  y: number
  width: number
  height: number
}

export type EditorAsset = {
  id: string
  url: string
  name: string
  width: number
  height: number
}

export type EditorDeck = {
  id: string
  title: string
  base_version: number
  draft_revision: number
  slide_size: { width: number; height: number }
  slides: EditorSlide[]
}

export type SaveEditorDraft = {
  base_version: number
  draft_revision: number
  title: string
  slides: {
    source_slide_number: number
    name: string
    hidden: boolean
    blocks: { field_key: string; text: string }[]
    layouts: {
      id: string
      x: number
      y: number
      width: number
      height: number
    }[]
    custom_blocks: {
      id: string
      text: string
      x: number
      y: number
      width: number
      height: number
      font_size: number
      weight: 400 | 500 | 700
      align: 'left' | 'center' | 'right'
      color: 'ink' | 'muted' | 'brand'
    }[]
    images: {
      id: string
      asset_id: string
      alt: string
      x: number
      y: number
      width: number
      height: number
    }[]
  }[]
}

export type EditorDraftSaved = {
  base_version: number
  draft_revision: number
  saved_at: number
}

export type AiActionParamOption = { id: string; label: string }
export type AiActionParam = {
  name: string
  /** `enum` and `string` are known; an unknown type is rendered as free text. */
  type: 'enum' | 'string' | (string & {})
  required: boolean
  max_length?: number | null
  options: AiActionParamOption[]
}
export type TextEditTargetKind = 'template_field' | 'custom_block'
export type AiAction = {
  id: string
  label: string
  description: string
  /** `quick` is a chat button, `input` is sent by the free-text field; unknown values act as `quick`. */
  ui: 'quick' | 'input' | (string & {})
  targets: (TextEditTargetKind | (string & {}))[]
  params: AiActionParam[]
}
export type AiActionCatalog = {
  actions: AiAction[]
  variants: { default: number; max: number }
  limits: { custom_block_max_input_chars: number }
  enabled: boolean
}
export type TextEditTarget =
  | { kind: 'template_field'; slide_id: string; field_key: string; block_id: null }
  | { kind: 'custom_block'; slide_id: string; field_key: null; block_id: string }
export type TextEditRequest = {
  request_id: string
  action: string
  params: Record<string, string>
  target: TextEditTarget
  text: string
  refines_edit_id: string | null
  variants: number
  model: string | null
}
export type TextVariantWarning = 'over_limit' | 'exceeds_hard_limit' | 'not_shorter' | 'line_breaks_removed'
export type TextVariant = {
  text: string
  length: number
  over_by: number
  warnings: (TextVariantWarning | (string & {}))[]
}
export type AiUsage = {
  input_tokens: number | null
  cached_input_tokens: number | null
  output_tokens: number | null
  reasoning_tokens: number | null
}
export type AiQuota = { limit: number; remaining: number; resets_at: string }
export type TextEditResponse = {
  edit_id: string
  request_id: string
  refines_edit_id: string | null
  status: 'ok' | 'unchanged' | 'unsupported'
  message: string | null
  action: string
  target: TextEditTarget
  source_text: string
  max_chars: number
  hard_max_chars: number
  variants: TextVariant[]
  model: string
  usage: AiUsage
  quota: AiQuota
  replayed: boolean
}
