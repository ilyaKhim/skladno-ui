'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { DATA_LIMITS, dataBlockError, type DataBlock } from '@/lib/data-blocks'

/** Work on a local copy: invalid partial numbers and cancellation never corrupt autosaved data. */
export function DataBlockEditor({ block, onApply, onClose }: {
  block: DataBlock; onApply: (block: DataBlock) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState(block)
  const error = dataBlockError(draft)
  const updateCell = (row: number, column: number, value: string) => setDraft((current) => row === -1
    ? { ...current, headers: current.headers.map((cell, index) => index === column ? value : cell) }
    : { ...current, rows: current.rows.map((cells, index) => index === row ? cells.map((cell, col) => col === column ? value : cell) : cells) })
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[90dvh] w-[min(760px,calc(100vw-2rem))]">
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div><DialogTitle>Данные блока</DialogTitle>
          <DialogDescription className="mt-1">Первая строка — заголовки. Для диаграммы первый столбец — категории, остальные — числа.</DialogDescription></div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Закрыть данные"><X /></Button>
      </header>
      <div className="min-h-0 overflow-auto p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">Вид
            <select aria-label="Вид блока" value={draft.type} className="h-9 rounded-md border border-input bg-card px-2 focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setDraft({ ...draft, type: event.target.value as DataBlock['type'] })}>
              <option value="table">Таблица</option><option value="bar">Столбчатая диаграмма</option>
            </select>
          </label>
          {draft.type === 'bar' && <label className="flex items-center gap-2"><input type="checkbox" checked={draft.horizontal}
            onChange={(event) => setDraft({ ...draft, horizontal: event.target.checked })} />Горизонтальные столбцы</label>}
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table aria-label="Данные таблицы или диаграммы" className="w-full border-collapse text-sm tabular-nums">
            <thead><tr>{draft.headers.map((cell, column) => <th key={column} className="min-w-32 border-b border-border bg-muted p-0">
              <input aria-label={`Заголовок ${column + 1}`} value={cell} maxLength={DATA_LIMITS.cellLength}
                onChange={(event) => updateCell(-1, column, event.target.value)}
                className="h-10 w-full min-w-32 bg-transparent px-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" />
            </th>)}</tr></thead>
            <tbody>{draft.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className="border-b border-border p-0 last:border-r-0">
              <input aria-label={`Строка ${index + 1}, столбец ${column + 1}`} value={cell} maxLength={DATA_LIMITS.cellLength}
                inputMode={draft.type === 'bar' && column > 0 ? 'decimal' : 'text'}
                onChange={(event) => updateCell(index, column, event.target.value)}
                className="h-10 w-full min-w-32 bg-card px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" />
            </td>)}</tr>)}</tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={draft.rows.length >= DATA_LIMITS.rows}
            onClick={() => setDraft({ ...draft, rows: [...draft.rows, draft.headers.map((_, index) => index > 0 && draft.type === 'bar' ? '0' : '')] })}>Добавить строку</Button>
          <Button variant="outline" size="sm" disabled={draft.headers.length >= DATA_LIMITS.columns}
            onClick={() => setDraft({ ...draft, headers: [...draft.headers, `Значение ${draft.headers.length}`], rows: draft.rows.map((row) => [...row, draft.type === 'bar' ? '0' : '']) })}>Добавить столбец</Button>
          <Button variant="ghost" size="sm" disabled={draft.rows.length <= 1} onClick={() => setDraft({ ...draft, rows: draft.rows.slice(0, -1) })}>Убрать последнюю строку</Button>
          <Button variant="ghost" size="sm" disabled={draft.headers.length <= 2}
            onClick={() => setDraft({ ...draft, headers: draft.headers.slice(0, -1), rows: draft.rows.map((row) => row.slice(0, -1)) })}>Убрать последний столбец</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">До 12 строк и 6 столбцов. Числа не генерируются автоматически: замените нули своими данными.</p>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-border p-4">
        <Button variant="outline" onClick={onClose}>Отмена</Button>
        <Button disabled={Boolean(error)} onClick={() => { onApply(draft); onClose() }}>Применить данные</Button>
      </footer>
    </DialogContent>
  </Dialog>
}
