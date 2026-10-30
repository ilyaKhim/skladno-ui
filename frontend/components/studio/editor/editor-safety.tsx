'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { EditorOperationError } from './editor-types'
import { downloadRecovery, type RecoveryEntry } from './editor-recovery'

interface EditorSafetyProps {
  error?: EditorOperationError | null
  candidate: RecoveryEntry | null
  canRestore: boolean
  storageError: boolean
  busy: boolean
  onRetry: () => void
  onDownload: () => void
  onReload?: () => Promise<void>
  onRestore: () => void
  onDiscard: () => void
}

export function EditorSafety({ error, candidate, canRestore, storageError, busy,
  onRetry, onDownload, onReload, onRestore, onDiscard }: EditorSafetyProps) {
  const [confirmation, setConfirmation] = useState<'reload' | 'restore' | null>(null)
  return (
    <>
      {error && (
        <div role="alert" aria-label="Ошибка редактора" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 basis-64 text-foreground">
            <span className="font-medium">{error.conflict ? 'Конфликт версий. ' : error.operation === 'export' ? 'Проверьте результат публикации. ' : 'Действие не выполнено. '}</span>
            {error.message}
          </p>
          <div className="flex flex-wrap gap-2">
            {!error.conflict && error.operation !== 'reload' && (
              <Button size="sm" disabled={busy} onClick={onRetry}>
                {error.operation === 'export' ? 'Повторить экспорт' : 'Повторить сохранение'}
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={busy} onClick={onDownload}>Скачать копию JSON</Button>
            {onReload && <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmation('reload')}>Открыть серверную версию</Button>}
          </div>
        </div>
      )}
      {candidate && (
        <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 basis-64">
            Найдена локальная копия от {new Date(candidate.copy.savedAt).toLocaleString('ru-RU')}.
            {!canRestore && ' Она относится к другой версии шаблона или презентации; скачайте её для ручного переноса.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {canRestore && <Button size="sm" disabled={busy} onClick={() => setConfirmation('restore')}>Восстановить копию</Button>}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => downloadRecovery(candidate.copy)}>Скачать найденную копию JSON</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={onDiscard}>Не восстанавливать</Button>
          </div>
        </div>
      )}
      {storageError && (
        <div role="alert" aria-label="Локальная копия недоступна" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 text-sm">
          <p className="flex-1 basis-64">Не удалось записать локальную копию в браузере. Пока правки не сохранены на сервере, держите вкладку открытой или скачайте копию.</p>
          <Button variant="outline" size="sm" onClick={onDownload}>Скачать копию JSON</Button>
        </div>
      )}
      <Dialog open={confirmation !== null} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null) }}>
        <DialogContent className="w-[min(30rem,calc(100vw-2rem))] gap-4 p-6">
          <DialogTitle>{confirmation === 'restore' ? 'Восстановить локальную копию?' : 'Открыть серверную версию?'}</DialogTitle>
          <DialogDescription>
            {confirmation === 'restore'
              ? 'Копия заменит открытый документ и будет отправлена на сервер. Если в другой вкладке были новые правки, они могут быть заменены. Действие можно отменить в редакторе.'
              : 'Откроется последний документ с сервера, история отмены начнётся заново. Несохранённая работа останется в локальной копии браузера; её также можно скачать перед продолжением.'}
          </DialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Остаться в редакторе</Button>
            <Button disabled={busy} onClick={() => {
              if (confirmation === 'restore') onRestore()
              else void onReload?.().catch(() => {})
              setConfirmation(null)
            }}>{confirmation === 'restore' ? 'Восстановить и сохранить' : 'Открыть версию с сервера'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
