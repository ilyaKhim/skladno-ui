export type Template = {
  id: string
  name: string
  description: string
  available_slides: number
  preview_url: string
}
export type ModelOption = { id: string; name: string }
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
  status: 'awaiting_content' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  error_code: string | null
  slide_count: number | null
  download_url: string | null
  /** Unix timestamp in seconds, as returned by the presentations API. */
  created_at: number
  version: number
  model: string | null
}
export type TemplateContext = {
  fields: Record<string, number>
  slides: { slide: number; fields: string[] }[]
}
export type AiCall = {
  id: string
  operation: 'generation' | 'chat'
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
