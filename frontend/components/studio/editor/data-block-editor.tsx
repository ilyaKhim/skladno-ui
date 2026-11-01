'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DATA_LIMITS, DATA_BLOCK_NAMES, dataBlockError, isNumericChart, type DataBlock } from '@/lib/data-blocks'

/** Work on a local copy: invalid partial numbers and cancellation never corrupt autosaved data. */
export function DataBlockEditor({ block: draft, onChange, onApply, onClose }: {
  block: DataBlock; onChange: (block: DataBlock) => void; onApply: (block: DataBlock) => void; onClose: () => void
}) {
  const firstInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    firstInput.current?.focus({ preventScroll: true })
    return () => { if (previous instanceof HTMLElement && previous.isConnected) requestAnimationFrame(() => previous.focus({ preventScroll: true })) }
  }, [])
  const error = dataBlockError(draft)
  const updateCell = (row: number, column: number, value: string) => onChange(row === -1
    ? { ...draft, headers: draft.headers.map((cell, index) => index === column ? value : cell) }
    : { ...draft, rows: draft.rows.map((cells, index) => index === row ? cells.map((cell, col) => col === column ? value : cell) : cells) })
  return <section aria-label="Данные блока" aria-describedby="data-editor-help"
    className="flex h-[min(20rem,43dvh)] min-h-0 shrink-0 flex-col border-t border-border bg-card"
    onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if ((event.metaKey || event.ctrlKey) && ['enter', 's'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        if (!error) { onApply(draft); onClose() }
      }
    }}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2">
        <div className="flex items-center gap-3"><h2 className="text-sm font-semibold">Данные блока</h2>
          <span className="hidden text-xs text-muted-foreground lg:inline">Предпросмотр · ещё не применено</span></div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onClose}>Отмена</Button>
          <Button size="sm" disabled={Boolean(error)} onClick={() => { onApply(draft); onClose() }} aria-label="Применить данные">Применить</Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Закрыть данные"><X /></Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 overflow-x-auto px-3 py-1.5 text-xs">
          <label className="flex shrink-0 items-center gap-2">Вид
            <select aria-label="Вид блока" value={draft.type} className="h-8 max-w-52 rounded-md border border-input bg-card px-2 focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => onChange({ ...draft, type: event.target.value as DataBlock['type'] })}>
              {Object.entries(DATA_BLOCK_NAMES).map(([type, name]) => <option key={type} value={type}>{name}</option>)}
            </select>
          </label>
          {draft.type === 'bar' && <label className="flex shrink-0 items-center gap-2"><input type="checkbox" checked={draft.horizontal}
            onChange={(event) => onChange({ ...draft, horizontal: event.target.checked })} />Горизонтальные столбцы</label>}
          <p id="data-editor-help" className="hidden min-w-52 text-muted-foreground xl:block">{draft.type === 'kpi' ? 'Одна строка: подпись и значение с единицами измерения.'
            : draft.type === 'comparison' ? 'Первый столбец — критерии, остальные — сравниваемые варианты.'
            : draft.type === 'doughnut' ? 'Два столбца: категории и неотрицательные числа. Их сумма должна быть больше нуля.'
            : draft.type === 'line' ? 'Точки соединяются в порядке строк. Первый столбец — категории, остальные — числа.'
            : 'Первая строка — заголовки. Для графика первый столбец — категории, остальные — числа.'}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto border-y border-border">
          <table aria-label="Данные таблицы или диаграммы" className="w-full border-collapse text-sm tabular-nums">
            <thead className="sticky top-0 z-10"><tr>{draft.headers.map((cell, column) => <th key={column} className="min-w-32 border-b border-r border-border bg-muted p-0">
              <input ref={column === 0 ? firstInput : undefined} aria-label={`Заголовок ${column + 1}`} value={cell} maxLength={DATA_LIMITS.cellLength}
                onChange={(event) => updateCell(-1, column, event.target.value)}
                className="h-10 w-full min-w-32 bg-transparent px-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" />
            </th>)}</tr></thead>
            <tbody>{draft.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className="border-b border-r border-border p-0 last:border-r-0">
              <input aria-label={`Строка ${index + 1}, столбец ${column + 1}`} value={cell} maxLength={DATA_LIMITS.cellLength}
                inputMode={isNumericChart(draft.type) && column > 0 ? 'decimal' : 'text'}
                onChange={(event) => updateCell(index, column, event.target.value)}
                className="h-10 w-full min-w-32 bg-card px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" />
            </td>)}</tr>)}</tbody>
          </table>
        </div>
        <div className="flex shrink-0 gap-2 overflow-x-auto px-3 py-1.5">
          <Button variant="outline" size="sm" disabled={draft.rows.length >= (draft.type === 'kpi' ? 1 : DATA_LIMITS.rows)}
            onClick={() => onChange({ ...draft, rows: [...draft.rows, draft.headers.map((_, index) => index > 0 && isNumericChart(draft.type) ? '0' : '')] })}>Добавить строку</Button>
          <Button variant="outline" size="sm" disabled={draft.headers.length >= (['kpi', 'doughnut'].includes(draft.type) ? 2 : DATA_LIMITS.columns)}
            onClick={() => onChange({ ...draft, headers: [...draft.headers, `Значение ${draft.headers.length}`], rows: draft.rows.map((row) => [...row, isNumericChart(draft.type) ? '0' : '']) })}>Добавить столбец</Button>
          <Button variant="ghost" size="sm" disabled={draft.rows.length <= 1} onClick={() => onChange({ ...draft, rows: draft.rows.slice(0, -1) })}>Убрать последнюю строку</Button>
          <Button variant="ghost" size="sm" disabled={draft.headers.length <= 2}
            onClick={() => onChange({ ...draft, headers: draft.headers.slice(0, -1), rows: draft.rows.map((row) => row.slice(0, -1)) })}>Убрать последний столбец</Button>
        </div>
        {error && <p role="alert" className="shrink-0 px-3 pb-2 text-xs text-destructive">{error}</p>}
      </div>
  </section>
}
