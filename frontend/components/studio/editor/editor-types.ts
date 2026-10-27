export type BlockRole = 'eyebrow' | 'title' | 'subtitle' | 'body' | 'metric' | 'caption'
export type BlockColor = 'ink' | 'muted' | 'brand'
export type BlockAlign = 'left' | 'center' | 'right'
export type BlockWeight = 400 | 500 | 700
export type SlideTheme = 'paper' | 'navy'
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

export interface TextParagraphStyle {
  /** Order inside the owning PowerPoint text shape. */
  index: number
  bullet?: string
  bulletColor?: string
  lineHeight?: number
  /** Spacing and margins in px at the canonical 960 px slide width. */
  spaceBefore: number
  spaceAfter: number
  leftMargin: number
  indent: number
}

export interface TextBlock {
  id: string
  /** Semantic template field. Repeated occurrences are edited together. */
  fieldKey?: string
  /** Template text shape whose geometry is shared by all fields inside it. */
  layoutKey?: string
  maxChars?: number
  role: BlockRole
  text: string
  /** Position and width are percentages of the slide frame. */
  x: number
  y: number
  width: number
  height: number
  /** Font size in px relative to a 960px-wide slide; scales with the frame. */
  fontSize: number
  weight: BlockWeight
  align: BlockAlign
  color: BlockColor
  /** Resolved PowerPoint font color; custom text continues using semantic color tokens. */
  fontColor?: string
  /** Present for template fields; geometry remains owned by layoutKey. */
  paragraph?: TextParagraphStyle
}

export interface ImageBlock {
  id: string
  assetId: string
  url: string
  alt: string
  x: number
  y: number
  width: number
  height: number
}

export interface Slide {
  id: string
  sourceSlideNumber?: number
  name: string
  theme: SlideTheme
  backgroundUrl?: string
  hidden: boolean
  blocks: TextBlock[]
  images: ImageBlock[]
}

export interface Deck {
  id: string
  title: string
  baseVersion?: number
  draftRevision?: number
  downloadUrl?: string
  slides: Slide[]
}

export type EditableBlockFields = Partial<Omit<TextBlock, 'id' | 'role'>>
export type EditableImageFields = Partial<Omit<ImageBlock, 'id' | 'assetId' | 'url'>>

export const CUSTOM_TEXT_MAX_CHARS = 4000

export const BLOCK_ROLE_LABELS: Record<BlockRole, string> = {
  eyebrow: 'Надзаголовок',
  title: 'Заголовок',
  subtitle: 'Подзаголовок',
  body: 'Основной текст',
  metric: 'Показатель',
  caption: 'Подпись',
}

export const SLIDE_BASE_WIDTH = 960
