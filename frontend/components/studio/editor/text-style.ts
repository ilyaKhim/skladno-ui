import type { SlideTheme, TextBlock } from './editor-types'

export const EDITOR_FONTS = ['Arial', 'Inter', 'Manrope', 'Georgia', 'Times New Roman', 'Courier New'] as const

/** Exact local family names differ from the font names written to the PowerPoint file. */
export function browserFont(family: string | undefined): string | undefined {
  if (!family) return undefined
  if (family === 'Inter') return '"Inter Variable", sans-serif'
  if (family === 'Manrope') return '"Manrope Variable", sans-serif'
  return `"${family.replaceAll(/["\\]/g, '')}", sans-serif`
}

const TEXT_COLORS = {
  paper: { ink: '#142033', muted: '#5b6675', brand: '#335cc5' },
  navy: { ink: '#f5f7fb', muted: '#b4c0d3', brand: '#d7f36a' },
}

export function resolvedTextStyle(block: TextBlock, theme: SlideTheme = 'paper') {
  const style = block.textStyle
  return {
    fontFamily: style?.font_family ?? block.fontFamily ?? 'Arial',
    fontSize: style?.font_size ?? block.fontSize,
    weight: style?.weight ?? block.weight,
    align: style?.align ?? block.align,
    color: style?.color ?? block.fontColor ?? TEXT_COLORS[theme][block.color],
    italic: style?.italic ?? block.italic ?? false,
    underline: style?.underline ?? block.underline ?? false,
  }
}

/** Recovery and clipboard input may supply values, but never arbitrary CSS or font URLs. */
export function validTextStyle(value: unknown): boolean {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const style = value as Record<string, unknown>
  if (Object.keys(style).some((key) => !['font_family', 'font_size', 'weight', 'align', 'color', 'italic', 'underline'].includes(key))) return false
  return (style.font_family == null || EDITOR_FONTS.some((font) => font === style.font_family))
    && (style.font_size == null || (Number.isInteger(style.font_size) && Number(style.font_size) >= 8 && Number(style.font_size) <= 96))
    && (style.weight == null || (typeof style.weight === 'number' && [400, 500, 700].includes(style.weight)))
    && (style.align == null || ['left', 'center', 'right'].includes(String(style.align)))
    && (style.color == null || (typeof style.color === 'string' && /^#[\da-f]{6}$/i.test(style.color)))
    && (style.italic == null || typeof style.italic === 'boolean')
    && (style.underline == null || typeof style.underline === 'boolean')
}
