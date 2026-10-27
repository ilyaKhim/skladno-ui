'use client'

import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  createEditorImage,
  duplicateEditorImage,
  moveEditorElement,
  validateEditorImage,
} from '@/lib/editor-image'
import type { EditorAsset } from '@/lib/generation-types'
import { AiAssistantTrigger } from './ai-assistant-trigger'
import { EditorToolbar } from './editor-toolbar'
import {
  BLOCK_ROLE_LABELS,
  CUSTOM_TEXT_MAX_CHARS,
  type Deck,
  type EditorOperationError,
  type ImageBlock,
  type TextBlock,
} from './editor-types'
import { PropertiesPanel } from './properties-panel'
import { SlideCanvas } from './slide-canvas'
import { SlideRail } from './slide-rail'
import { useEditorState } from './use-editor-state'
import { useEditorRecovery } from './use-editor-recovery'
import { restoreRecovery, type EditorVersion } from './editor-recovery'
import { EditorSafety } from './editor-safety'

const WIDE_LAYOUT_QUERY = '(min-width: 1024px)'
const ELEMENT_CLIPBOARD_TYPE = 'application/x-godeck-element'

function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  )
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

type EditorShellProps = {
  initialDeck: Deck
  onSave?: (deck: Deck) => Promise<void>
  onExport?: () => Promise<void>
  onUploadImage?: (file: File) => Promise<EditorAsset>
  contentOnly?: boolean
  ownerId?: string
  getVersion?: () => EditorVersion
  operationError?: EditorOperationError | null
  onReloadServer?: () => Promise<void>
}

export function EditorShell({ initialDeck, onSave, onExport, onUploadImage, contentOnly = false,
  ownerId, getVersion, operationError, onReloadServer }: EditorShellProps) {
  const recovery = useEditorRecovery(initialDeck, ownerId, getVersion)
  const editor = useEditorState(initialDeck, onSave, { onChange: recovery.backup, onSaved: recovery.clear })
  const { deck } = editor
  const [selectedSlideId, setSelectedSlideId] = useState(initialDeck.slides[0]?.id ?? '')
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const [processing, setProcessing] = useState<'export' | 'leave' | 'reload' | null>(null)
  const busy = useRef(false)
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY)
  const textFieldRef = useRef<HTMLTextAreaElement>(null)

  const protectUnload = useEffectEvent((event: BeforeUnloadEvent) => {
    if (!editor.hasUnsavedChanges() && !imageUploading) return
    event.preventDefault()
    event.returnValue = 'unsaved'
  })
  const protectBackground = useEffectEvent(() => {
    if (!editor.hasUnsavedChanges()) return
    recovery.backup(editor.getDeck())
    // A document being unloaded cannot safely start a new CSRF/fetch chain (notably in WebKit).
  })
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => protectUnload(event)
    const background = () => protectBackground()
    window.addEventListener('beforeunload', unload)
    window.addEventListener('pagehide', background)
    document.addEventListener('visibilitychange', background)
    return () => {
      window.removeEventListener('beforeunload', unload)
      window.removeEventListener('pagehide', background)
      document.removeEventListener('visibilitychange', background)
    }
  }, [])

  const exportDocument = async () => {
    if (busy.current) throw new Error('Дождитесь завершения текущего действия.')
    if (imageUploading) {
      setImageError('Дождитесь завершения загрузки изображения перед экспортом.')
      throw new Error('Изображение ещё загружается.')
    }
    busy.current = true
    setProcessing('export')
    try {
      if (!(await editor.saveNow())) throw new Error('Не удалось сохранить изменения перед экспортом.')
      await onExport?.()
    } finally {
      busy.current = false
      setProcessing(null)
    }
  }

  const leaveEditor = async () => {
    if (busy.current) return
    if (imageUploading) { setImageError('Дождитесь завершения загрузки изображения перед выходом.'); return }
    busy.current = true
    setProcessing('leave')
    try {
      if (!editor.hasUnsavedChanges() || await editor.saveNow()) window.location.assign('/studio')
    } finally {
      busy.current = false
      setProcessing(null)
    }
  }

  const reloadServer = async () => {
    if (busy.current) return
    busy.current = true
    setProcessing('reload')
    try {
      if (editor.hasUnsavedChanges()) {
        recovery.backup(editor.getDeck())
        // Join an in-flight save before fetching server metadata. A failed save is still recoverable.
        await editor.saveNow()
      }
      await onReloadServer?.()
    } finally {
      busy.current = false
      setProcessing(null)
    }
  }

  const slideIndex = Math.max(
    0,
    deck.slides.findIndex((slide) => slide.id === selectedSlideId),
  )
  const slide = deck.slides[slideIndex]
  const block = slide.blocks.find((item) => item.id === selectedElementId) ?? null
  const image = slide.images.find((item) => item.id === selectedElementId) ?? null
  const hiddenCount = deck.slides.filter((item) => item.hidden).length

  const selectSlide = (slideId: string) => {
    setSelectedSlideId(slideId)
    setSelectedElementId(null)
  }

  const activateBlock = (blockId: string) => {
    setSelectedElementId(blockId)
    setPanelOpen(true)
    requestAnimationFrame(() => textFieldRef.current?.focus())
  }

  const toggleSlideHidden = (slideId: string) => {
    const target = deck.slides.find((item) => item.id === slideId)
    if (target) editor.updateSlide(slideId, { hidden: !target.hidden })
  }

  const insertTextBlock = (text = 'Новый текст', source?: TextBlock) => {
    const offset = ((slide.blocks.filter((item) => !item.fieldKey).length + 1) % 6) * 2
    const id = `text-${crypto.randomUUID()}`
    const width = source?.width ?? 36
    const height = source?.height ?? 14
    const next: TextBlock = {
      id,
      role: source?.role ?? 'body',
      text: text.slice(0, CUSTOM_TEXT_MAX_CHARS),
      x: Math.min((source?.x ?? 12) + offset, 100 - width),
      y: Math.min((source?.y ?? 18) + offset, 100 - height),
      width,
      height,
      fontSize: source?.fontSize ?? 24,
      weight: source?.weight ?? 400,
      align: source?.align ?? 'left',
      color: source?.color ?? 'ink',
      maxChars: CUSTOM_TEXT_MAX_CHARS,
    }
    editor.addBlock(slide.id, next)
    setSelectedElementId(id)
    setPanelOpen(true)
    requestAnimationFrame(() => textFieldRef.current?.focus())
  }

  const duplicateBlock = () => {
    if (block) insertTextBlock(block.text, block)
  }

  const insertImageBlock = (asset: EditorAsset) => {
    const next = createEditorImage(asset, slide.images.length)
    editor.addImage(slide.id, next)
    setSelectedElementId(next.id)
    setPanelOpen(true)
  }

  const uploadAndInsertImage = async (file: File) => {
    if (!onUploadImage || imageUploading) return
    const validationError = validateEditorImage(file)
    if (validationError) {
      setImageError(validationError)
      return
    }
    setImageUploading(true)
    setImageError('')
    try {
      insertImageBlock(await onUploadImage(file))
    } catch (uploadError) {
      setImageError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить изображение.')
    } finally {
      setImageUploading(false)
    }
  }

  const duplicateImage = () => {
    if (!image) return
    const next = duplicateEditorImage(image, slide.images.length)
    editor.addImage(slide.id, next)
    setSelectedElementId(next.id)
    setPanelOpen(true)
  }

  const removeBlock = () => {
    if (!block || block.fieldKey) return
    editor.removeBlock(slide.id, block.id)
    setSelectedElementId(null)
  }

  const removeImage = () => {
    if (!image) return
    editor.removeImage(slide.id, image.id)
    setSelectedElementId(null)
  }

  const duplicateElement = () => image ? duplicateImage() : duplicateBlock()
  const removeElement = () => image ? removeImage() : removeBlock()

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || busy.current) return
    const mod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()

    if (mod && key === 's') {
      event.preventDefault()
      editor.saveNow()
      return
    }
    if (isEditableTarget(event.target)) return

    if (mod && key === 'd' && (block || image)) {
      event.preventDefault()
      duplicateElement()
    } else if (mod && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) editor.redo()
      else editor.undo()
    } else if (mod && key === 'y') {
      event.preventDefault()
      editor.redo()
    } else if (event.key === 'Escape') {
      if (!isWide && panelOpen) setPanelOpen(false)
      else setSelectedElementId(null)
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && (image || (block && !block.fieldKey))) {
      event.preventDefault()
      removeElement()
    } else if (key === 't' && !mod) {
      event.preventDefault()
      insertTextBlock()
    } else if (block && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      editor.updateBlock(
        slide.id,
        block.id,
        moveEditorElement(block, event.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown', event.shiftKey ? 2 : 0.5),
        `${block.id}:keyboard-move`,
      )
    } else if (image && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      editor.updateImage(
        slide.id,
        image.id,
        moveEditorElement(image, event.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown', event.shiftKey ? 2 : 0.5),
        `${image.id}:keyboard-move`,
      )
    }
  })

  const onCopy = useEffectEvent((event: ClipboardEvent) => {
    if (busy.current) return
    if ((!block && !image) || isEditableTarget(event.target) || !event.clipboardData) return
    event.preventDefault()
    event.clipboardData.setData(
      ELEMENT_CLIPBOARD_TYPE,
      JSON.stringify(image ? { kind: 'image', deckId: deck.id, value: image } : { kind: 'text', value: block }),
    )
    event.clipboardData.setData('text/plain', image ? image.alt : block?.text ?? '')
  })

  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    if (busy.current) return
    if (isEditableTarget(event.target) || !event.clipboardData) return
    const pastedImage = [...event.clipboardData.items]
      .find((item) => item.kind === 'file' && ['image/png', 'image/jpeg'].includes(item.type))
      ?.getAsFile()
    if (pastedImage) {
      event.preventDefault()
      void uploadAndInsertImage(pastedImage)
      return
    }
    const serialized = event.clipboardData.getData(ELEMENT_CLIPBOARD_TYPE)
    if (serialized) {
      try {
        const copied = JSON.parse(serialized) as { kind?: string; deckId?: string; value?: TextBlock | ImageBlock }
        if (copied.kind === 'text' && copied.value && 'text' in copied.value) {
          event.preventDefault()
          insertTextBlock(copied.value.text, copied.value)
          return
        }
        if (copied.kind === 'image' && copied.deckId === deck.id && copied.value && 'assetId' in copied.value) {
          event.preventDefault()
          const next = duplicateEditorImage(copied.value, slide.images.length)
          editor.addImage(slide.id, next)
          setSelectedElementId(next.id)
          setPanelOpen(true)
          return
        }
      } catch {
        // Fall through to plain text from another application.
      }
    }
    const text = event.clipboardData.getData('text/plain')
    if (!text) return
    event.preventDefault()
    insertTextBlock(text)
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    const copyListener = (event: ClipboardEvent) => onCopy(event)
    const pasteListener = (event: ClipboardEvent) => onPaste(event)
    window.addEventListener('keydown', listener)
    window.addEventListener('copy', copyListener)
    window.addEventListener('paste', pasteListener)
    return () => {
      window.removeEventListener('keydown', listener)
      window.removeEventListener('copy', copyListener)
      window.removeEventListener('paste', pasteListener)
    }
  }, [])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div inert={processing !== null}>
        <EditorToolbar
          title={deck.title}
          slideCount={deck.slides.length}
          hiddenCount={hiddenCount}
          saveStatus={editor.saveStatus}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          panelToggleVisible={!isWide}
          panelOpen={panelOpen}
          onRename={editor.renameDeck}
          onCommitTitle={editor.sealHistory}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onSave={() => void editor.saveNow()}
          onAddText={() => insertTextBlock()}
          onAddImage={onUploadImage ? (file) => void uploadAndInsertImage(file) : undefined}
          imageUploading={imageUploading}
          onExport={onExport ? exportDocument : undefined}
          onBack={() => void leaveEditor()}
          onTogglePanel={() => setPanelOpen((open) => !open)}
          titleEditable={!contentOnly}
        />
      </div>
      <EditorSafety
        error={operationError}
        candidate={recovery.candidate}
        canRestore={Boolean(recovery.candidate && restoreRecovery(recovery.candidate.copy,
          { ...initialDeck, baseVersion: getVersion?.().base ?? initialDeck.baseVersion }))}
        storageError={recovery.storageError}
        busy={processing !== null}
        onRetry={() => {
          if (operationError?.operation === 'export') void exportDocument().catch(() => {})
          else void editor.saveNow()
        }}
        onDownload={() => recovery.download(editor.getDeck())}
        onReload={onReloadServer ? reloadServer : undefined}
        onRestore={() => {
          if (!recovery.candidate) return
          const restored = restoreRecovery(recovery.candidate.copy,
            { ...initialDeck, baseVersion: getVersion?.().base ?? initialDeck.baseVersion })
          if (restored) { recovery.accept(); editor.restoreDeck(restored) }
        }}
        onDiscard={recovery.discard}
      />
      {processing && <p role="status" className="shrink-0 border-b border-border px-4 py-2 text-sm text-muted-foreground">
        {processing === 'leave' ? 'Сохраняем изменения перед выходом…' : processing === 'reload' ? 'Загружаем серверную версию…' : 'Подготавливаем PowerPoint…'}
      </p>}

      <div inert={processing !== null} className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <SlideRail
          slides={deck.slides}
          selectedSlideId={slide.id}
          onSelectSlide={selectSlide}
          onMoveSlide={editor.moveSlide}
          onToggleHidden={toggleSlideHidden}
        />

        <main className="relative min-h-0 min-w-0 flex-1">
          {imageError && (
            <div role="alert" className="absolute top-12 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-destructive/25 bg-card px-3 py-2 text-xs text-destructive shadow-md">
              <AlertCircle className="size-4 shrink-0" />
              <span>{imageError}</span>
              <button type="button" className="ml-1 underline underline-offset-2" onClick={() => setImageError('')}>Закрыть</button>
            </div>
          )}
          <SlideCanvas
            slide={slide}
            slideIndex={slideIndex}
            slideCount={deck.slides.length}
            selectedElementId={selectedElementId}
            selectedElementKind={image ? 'image' : block ? 'text' : null}
            selectedElementCanMove={Boolean(image || block)}
            onSelectElement={setSelectedElementId}
            onActivateBlock={activateBlock}
            onToggleHidden={() => toggleSlideHidden(slide.id)}
            onUpdateBlock={(blockId, patch, coalesceKey) => editor.updateBlock(slide.id, blockId, patch, coalesceKey)}
            onUpdateImage={(imageId, patch, coalesceKey) => editor.updateImage(slide.id, imageId, patch, coalesceKey)}
            onCommitElement={editor.sealHistory}
          />
          {!contentOnly && (
            <AiAssistantTrigger
              contextLabel={block ? `${BLOCK_ROLE_LABELS[block.role].toLowerCase()}, слайд ${slideIndex + 1}` : null}
            />
          )}
        </main>

        <PropertiesPanel
          slide={slide}
          slideIndex={slideIndex}
          block={block}
          image={image}
          open={panelOpen}
          isDrawer={!isWide}
          textFieldRef={textFieldRef}
          onClose={() => setPanelOpen(false)}
          onSelectElement={setSelectedElementId}
          onUpdateBlock={(patch, coalesceKey) => {
            if (block) editor.updateBlock(slide.id, block.id, patch, coalesceKey)
          }}
          onUpdateImage={(patch, coalesceKey) => {
            if (image) editor.updateImage(slide.id, image.id, patch, coalesceKey)
          }}
          onUpdateSlide={(patch, coalesceKey) => editor.updateSlide(slide.id, patch, coalesceKey)}
          onCommitField={editor.sealHistory}
          onDeleteElement={removeElement}
          onDuplicateElement={duplicateElement}
          contentOnly={contentOnly}
        />
      </div>
    </div>
  )
}
