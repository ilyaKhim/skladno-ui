'use client'

import type { Template } from '@/lib/generation-types'

type Props = {
  templates: Template[]
  loading: boolean
  onChoose: (id: string) => void
}

/** Shows available template artwork; creation and its state remain with the studio. */
export function StudioTemplates({ templates, loading, onChoose }: Props) {
  return (
    <>
      <p className="mb-6 max-w-2xl text-sm leading-6 text-muted-foreground">
        Выберите оформление для новой презентации. Слайды останутся редактируемыми в GoDeck и
        PowerPoint.
      </p>
      {loading ? (
        <p role="status">Загружаем шаблоны…</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => onChoose(template.id)}
                className="group w-full overflow-hidden rounded-xl border border-border bg-card text-left outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                {template.preview_url && (
                  <img
                    src={template.preview_url}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                )}
                <span className="block p-4">
                  <span className="flex items-center justify-between gap-3 font-semibold">
                    {template.name}
                    <span className="text-xs font-normal text-muted-foreground">
                      {template.available_slides} слайдов
                    </span>
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                    {template.description}
                  </span>
                  <span className="mt-4 block text-sm font-medium text-primary">
                    Использовать шаблон
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
