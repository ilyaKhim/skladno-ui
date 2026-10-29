import type {
  OutlineSlide,
  PresentationJob,
  PresentationOutline,
  SavePresentationOutline,
} from './generation-types'

export function canEditOutlineTitle(slide: OutlineSlide) {
  return Boolean(slide.title_field_key) && slide.title_max_chars !== null && slide.title_max_chars > 0
}

/** Send only server-declared editable titles; display labels are never semantic field values. */
export function outlinePayload(outline: PresentationOutline, slides: OutlineSlide[]): SavePresentationOutline {
  return {
    revision: outline.revision,
    slides: slides.map((slide) => ({
      source_slide_number: slide.source_slide_number,
      include: slide.include,
      title: canEditOutlineTitle(slide) ? slide.title.trim() : null,
    })),
  }
}

export function outlineIsDirty(outline: PresentationOutline | null, slides: OutlineSlide[]) {
  return outline !== null && JSON.stringify(outlinePayload(outline, slides).slides)
    !== JSON.stringify(outlinePayload(outline, outline.slides).slides)
}

export function outlineTitleError(slide: OutlineSlide) {
  if (!canEditOutlineTitle(slide)) return null
  if (!slide.title.trim()) return 'Добавьте заголовок слайда.'
  if (slide.title.trim().length > slide.title_max_chars!)
    return `Сократите заголовок до ${slide.title_max_chars} символов.`
  return null
}

export function outlineValidationError(slides: OutlineSlide[]) {
  if (!slides.some((slide) => slide.include)) return 'Включите хотя бы один слайд перед сохранением или сборкой.'
  return slides.map(outlineTitleError).find(Boolean) ?? null
}

export function moveOutlineSlide(slides: OutlineSlide[], sourceSlide: number, direction: -1 | 1) {
  const index = slides.findIndex((slide) => slide.source_slide_number === sourceSlide)
  const target = index + direction
  if (index < 0 || target < 0 || target >= slides.length) return slides
  const reordered = [...slides]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  return reordered
}

export function protectUnsavedOutline(event: Pick<BeforeUnloadEvent, 'preventDefault' | 'returnValue'>) {
  event.preventDefault()
  event.returnValue = ''
}

/** Only an explicit client-error response proves that confirmation was rejected. */
export function outlineConfirmationRejected(status: number | undefined) {
  return status !== undefined && status >= 400 && status < 500
}

/** Confirming keeps an older card pinned until explicit close; cancellation already abandons it. */
export function shouldCloseCompletedOutline(status: PresentationJob['status']) {
  return status === 'cancelled'
}

type ConfirmOperations = {
  save: (input: SavePresentationOutline) => Promise<PresentationOutline>
  onSaved: (outline: PresentationOutline) => void
  onConfirming: (revision: number) => void
  confirm: (revision: number) => Promise<PresentationJob>
}

/** Save once before rendering; an uncertain confirm is retried with the exact known revision. */
export async function saveAndConfirmOutline(
  outline: PresentationOutline,
  slides: OutlineSlide[],
  retryRevision: number | null,
  operations: ConfirmOperations,
) {
  let revision = retryRevision
  if (revision === null) {
    if (outlineIsDirty(outline, slides)) {
      const saved = await operations.save(outlinePayload(outline, slides))
      operations.onSaved(saved)
      revision = saved.revision
    } else revision = outline.revision
    operations.onConfirming(revision)
  }
  return operations.confirm(revision)
}
