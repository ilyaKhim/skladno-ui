'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { generationApi } from '@/lib/generation-client'
import type { EditorDeck, SaveEditorDraft } from '@/lib/generation-types'
import { cn } from '@/lib/utils'
import { EditorShell } from './editor-shell'
import type { Deck } from './editor-types'

function toDeck(source: EditorDeck): Deck {
  return {
    id: source.id,
    title: source.title,
    baseVersion: source.base_version,
    draftRevision: source.draft_revision,
    slides: source.slides.map((slide) => ({
      id: slide.id,
      sourceSlideNumber: slide.source_slide_number,
      name: slide.name,
      theme: slide.theme,
      hidden: slide.hidden,
      blocks: slide.blocks.map((block) => ({
        id: block.id,
        fieldKey: block.field_key ?? undefined,
        layoutKey: block.layout_id ?? undefined,
        maxChars: block.max_chars,
        role: block.role,
        text: block.text,
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        fontSize: block.font_size,
        weight: block.weight,
        align: block.align,
        color: block.color,
      })),
      images: slide.images.map((image) => ({
        id: image.id,
        assetId: image.asset_id,
        url: image.url,
        alt: image.alt,
        x: image.x,
        y: image.y,
        width: image.width,
        height: image.height,
      })),
    })),
  }
}

function serialize(deck: Deck, baseVersion: number, draftRevision: number): SaveEditorDraft {
  return {
    base_version: baseVersion,
    draft_revision: draftRevision,
    title: deck.title,
    slides: deck.slides.map((slide) => {
      const fields = new Map<string, string>()
      const layouts = new Map<string, { id: string; x: number; y: number; width: number; height: number }>()
      for (const block of slide.blocks) {
        if (block.fieldKey) fields.set(block.fieldKey, block.text)
        if (block.fieldKey && block.layoutKey) {
          layouts.set(block.layoutKey, {
            id: block.layoutKey,
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
          })
        }
      }
      return {
        source_slide_number: slide.sourceSlideNumber ?? 0,
        name: slide.name,
        hidden: slide.hidden,
        blocks: [...fields].map(([field_key, text]) => ({ field_key, text })),
        layouts: [...layouts.values()],
        custom_blocks: slide.blocks
          .filter((block) => !block.fieldKey)
          .map((block) => ({
            id: block.id,
            text: block.text,
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
            font_size: block.fontSize,
            weight: block.weight,
            align: block.align,
            color: block.color,
          })),
        images: slide.images.map((image) => ({
          id: image.id,
          asset_id: image.assetId,
          alt: image.alt,
          x: image.x,
          y: image.y,
          width: image.width,
          height: image.height,
        })),
      }
    }),
  }
}

export function EditorPageClient() {
  const presentationId = useSearchParams().get('presentation')
  const [source, setSource] = useState<EditorDeck | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const version = useRef({ base: 0, draft: 0 })

  useEffect(() => {
    if (!presentationId) return
    const controller = new AbortController()
    setSource(null)
    setError('')
    generationApi
      .editor(presentationId, controller.signal)
      .then((deck) => {
        version.current = { base: deck.base_version, draft: deck.draft_revision }
        setSource(deck)
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted)
          setError(loadError instanceof Error ? loadError.message : 'Не удалось открыть презентацию.')
      })
    return () => controller.abort()
  }, [presentationId, reload])

  const save = useCallback(
    async (deck: Deck) => {
      if (!presentationId) throw new Error('Не указана презентация.')
      try {
        const saved = await generationApi.saveEditorDraft(
          presentationId,
          serialize(deck, version.current.base, version.current.draft),
        )
        version.current = { base: saved.base_version, draft: saved.draft_revision }
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить изменения.')
        throw saveError
      }
    },
    [presentationId],
  )

  const exportPptx = useCallback(async () => {
    if (!presentationId) throw new Error('Не указана презентация.')
    try {
      const committed = await generationApi.commitEditor(
        presentationId,
        version.current.base,
        version.current.draft,
      )
      const refreshed = await generationApi.editor(presentationId)
      version.current = { base: refreshed.base_version, draft: refreshed.draft_revision }
      setSource(refreshed)
      if (committed.download_url) window.location.assign(committed.download_url)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Не удалось собрать PowerPoint.')
      throw exportError
    }
  }, [presentationId])

  const uploadImage = useCallback(
    async (file: File) => {
      if (!presentationId) throw new Error('Не указана презентация.')
      return generationApi.uploadEditorImage(presentationId, file)
    },
    [presentationId],
  )

  if (!presentationId)
    return <EditorError message="Не указана презентация для редактирования." onRetry={null} />
  if (error) return <EditorError message={error} onRetry={() => setReload((value) => value + 1)} />
  if (!source)
    return (
      <main className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Загружаем редактор…</span>
      </main>
    )

  return (
    <EditorShell
      key={`${source.base_version}:${source.draft_revision}`}
      initialDeck={toDeck(source)}
      onSave={save}
      onExport={exportPptx}
      onUploadImage={uploadImage}
      contentOnly
    />
  )
}

function EditorError({ message, onRetry }: { message: string; onRetry: (() => void) | null }) {
  return (
    <main className="grid h-dvh place-items-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <div>
          <h1 className="font-semibold text-foreground">Редактор не открылся</h1>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/studio" className={cn(buttonVariants({ variant: 'outline' }))}>В студию</Link>
          {onRetry && <Button onClick={onRetry}>Повторить</Button>}
        </div>
      </div>
    </main>
  )
}
