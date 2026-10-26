export type BlockRole = 'eyebrow' | 'title' | 'subtitle' | 'body' | 'metric' | 'caption'
export type BlockColor = 'ink' | 'muted' | 'brand'
export type BlockAlign = 'left' | 'center' | 'right'
export type BlockWeight = 400 | 500 | 700
export type SlideTheme = 'paper' | 'navy'
export type SaveStatus = 'saved' | 'dirty' | 'saving'

export interface TextBlock {
  id: string
  role: BlockRole
  text: string
  /** Position and width are percentages of the slide frame. */
  x: number
  y: number
  width: number
  /** Font size in px relative to a 960px-wide slide; scales with the frame. */
  fontSize: number
  weight: BlockWeight
  align: BlockAlign
  color: BlockColor
}

export interface Slide {
  id: string
  name: string
  theme: SlideTheme
  hidden: boolean
  blocks: TextBlock[]
}

export interface Deck {
  id: string
  title: string
  slides: Slide[]
}

export type EditableBlockFields = Partial<Omit<TextBlock, 'id' | 'role'>>

export const BLOCK_ROLE_LABELS: Record<BlockRole, string> = {
  eyebrow: 'Надзаголовок',
  title: 'Заголовок',
  subtitle: 'Подзаголовок',
  body: 'Основной текст',
  metric: 'Показатель',
  caption: 'Подпись',
}

export const SLIDE_BASE_WIDTH = 960
