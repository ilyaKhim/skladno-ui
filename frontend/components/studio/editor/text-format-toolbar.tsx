'use client'

import { AlignCenter, AlignLeft, AlignRight, Bold, Copy, Italic, Trash2, Underline } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EditorTextStyle } from '@/lib/generation-types'
import type { ImageBlock, SlideTheme, TextBlock } from './editor-types'
import { EDITOR_FONTS, resolvedTextStyle } from './text-style'

interface TextFormatToolbarProps {
  theme: SlideTheme
  block: TextBlock | null
  image: ImageBlock | null
  onFormat: (patch: EditorTextStyle) => void
  onImageAlt: (alt: string) => void
  onDuplicate: () => void
  onDelete: () => void
  onCommit: () => void
}

/** Formatting stays next to the canvas; it changes the complete PowerPoint text box. */
export function TextFormatToolbar({ theme, block, image, onFormat, onImageAlt, onDuplicate, onDelete, onCommit }: TextFormatToolbarProps) {
  const style = block ? resolvedTextStyle(block, theme) : null
  return <div aria-label="Форматирование" className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card px-3 text-xs [scrollbar-width:thin]">
    {block && style ? <>
      <select aria-label="Шрифт" value={style.fontFamily} onChange={(event) => onFormat({ font_family: event.target.value })}
        className="h-8 w-36 shrink-0 rounded-md border border-input bg-card px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {!EDITOR_FONTS.some((font) => font === style.fontFamily) && <option value={style.fontFamily}>{style.fontFamily} · шаблон</option>}
        {EDITOR_FONTS.map((font) => <option key={font}>{font}</option>)}
      </select>
      <input key={`${block.id}:${style.fontSize}`} aria-label="Размер шрифта" type="number" min={8} max={96} defaultValue={style.fontSize}
        className="h-8 w-16 shrink-0 rounded-md border border-input bg-card px-2 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onBlur={(event) => {
          const value = Number(event.target.value)
          if (Number.isInteger(value) && value >= 8 && value <= 96) onFormat({ font_size: value })
          else event.target.value = String(style.fontSize)
          onCommit()
        }}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
      <Button variant={style.weight === 700 ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Жирный" aria-pressed={style.weight === 700} onClick={() => onFormat({ weight: style.weight === 700 ? 400 : 700 })}><Bold /></Button>
      <Button variant={style.italic ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Курсив" aria-pressed={style.italic} onClick={() => onFormat({ italic: !style.italic })}><Italic /></Button>
      <Button variant={style.underline ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Подчёркивание" aria-pressed={style.underline} onClick={() => onFormat({ underline: !style.underline })}><Underline /></Button>
      <label className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-muted focus-within:ring-2 focus-within:ring-ring" title="Цвет текста">
        <span aria-hidden className="border-b-4 px-1 font-semibold" style={{ borderColor: style.color ?? '#142033' }}>A</span>
        <input type="color" aria-label="Цвет текста" value={style.color ?? '#142033'} onChange={(event) => onFormat({ color: event.target.value })}
          className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
      {([{ value: 'left', label: 'По левому краю', Icon: AlignLeft }, { value: 'center', label: 'По центру', Icon: AlignCenter },
        { value: 'right', label: 'По правому краю', Icon: AlignRight }] as const).map(({ value, label, Icon }) =>
          <Button key={value} variant={style.align === value ? 'secondary' : 'ghost'} size="icon-sm" aria-label={label} aria-pressed={style.align === value} onClick={() => onFormat({ align: value })}><Icon /></Button>)}
      <span className="ml-2 hidden whitespace-nowrap text-muted-foreground 2xl:inline">Весь текстовый блок</span>
    </> : image ? <label className="flex items-center gap-2 whitespace-nowrap text-muted-foreground">Описание изображения
      <input aria-label="Описание изображения" value={image.alt} maxLength={500} onChange={(event) => onImageAlt(event.target.value)} onBlur={onCommit}
        className="h-8 w-52 rounded-md border border-input px-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </label> : <p className="text-muted-foreground">Выберите текст для форматирования. Двойной щелчок — редактирование на слайде.</p>}
    {(block || image) && <div className="ml-auto flex shrink-0 gap-1 pl-3">
      <Button variant="ghost" size="icon-sm" aria-label="Дублировать элемент" title="Дублировать (Ctrl+D)" onClick={onDuplicate}><Copy /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Удалить элемент" title={block?.fieldKey ? 'Текст шаблона можно очистить при редактировании' : 'Удалить'} disabled={Boolean(block?.fieldKey)} onClick={onDelete}><Trash2 /></Button>
    </div>}
  </div>
}
