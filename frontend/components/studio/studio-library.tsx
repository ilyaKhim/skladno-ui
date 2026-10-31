'use client'

import { useState } from 'react'
import { FileText, Presentation, RefreshCw, Search, Sparkles, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ModelOption, PresentationJob, Template } from '@/lib/generation-types'
import {
  selectPresentations,
  type PresentationFilter,
  type PresentationSort,
} from '@/lib/studio-presentations'
import { PresentationCard } from './presentation-card'

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'draft', label: 'Черновики' },
  { id: 'succeeded', label: 'Готовые' },
  { id: 'processing', label: 'В работе' },
] as const

type Props = {
  jobs: PresentationJob[]
  templates: Template[]
  models: ModelOption[]
  defaultModel: string
  openaiEnabled: boolean
  loading: boolean
  loadFailed: boolean
  onCreate: (mode: 'openai' | 'response') => void
  onResume: (job: PresentationJob) => void
  onChanged: () => Promise<void>
  onError: (message: string) => void
}

/** Owns library-only controls; stays mounted when the user opens creation or templates. */
export function StudioLibrary({
  jobs,
  templates,
  models,
  defaultModel,
  openaiEnabled,
  loading,
  loadFailed,
  onCreate,
  onResume,
  onChanged,
  onError,
}: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PresentationFilter>('all')
  const [sort, setSort] = useState<PresentationSort>('newest')
  const visibleJobs = selectPresentations(jobs, search, filter, sort)

  function resetFilters() {
    setSearch('')
    setFilter('all')
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap gap-3" aria-label="Начать презентацию">
        <Button variant="outline" className="min-h-11 bg-card" onClick={() => onCreate('openai')}>
          <Sparkles aria-hidden />
          Создать с AI
        </Button>
        <Button variant="outline" className="min-h-11 bg-card" onClick={() => onCreate('openai')}>
          <Upload aria-hidden />
          Из PDF, DOCX или TXT
        </Button>
        <Button variant="outline" className="min-h-11 bg-card" onClick={() => onCreate('response')}>
          <FileText aria-hidden />
          Вставить ответ LLM
        </Button>
      </div>
      <section aria-labelledby="history-title">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="history-title" className="font-display text-lg font-bold">
              Ваши презентации
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Последние {jobs.length} проектов · поиск по загруженному списку
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="studio-sort">
              Порядок презентаций
            </label>
            <select
              id="studio-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as PresentationSort)}
              className="min-h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="newest">Сначала новые</option>
              <option value="oldest">Сначала старые</option>
              <option value="title">По названию</option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Обновить список"
              onClick={() => onChanged().catch((cause) => onError(cause.message))}
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-64">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
            />
            <input
              type="search"
              aria-label="Поиск презентаций"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти презентацию"
              className="min-h-10 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div role="group" aria-label="Статус презентаций" className="flex flex-wrap gap-1">
            {FILTERS.map((item) => (
              <Button
                key={item.id}
                variant={filter === item.id ? 'secondary' : 'ghost'}
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        {loading ? (
          <p role="status" className="py-12 text-sm text-muted-foreground">
            Загружаем презентации…
          </p>
        ) : loadFailed ? (
          <p className="py-12 text-sm text-muted-foreground">
            Данные пока не загружены. Повторите попытку с помощью кнопки выше.
          </p>
        ) : visibleJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center">
            <Presentation className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-4 font-semibold">
              {jobs.length ? 'Презентации не найдены' : 'Ваша первая презентация начинается здесь'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {jobs.length
                ? 'Измените запрос или выберите другой статус.'
                : 'Задайте тему или добавьте материалы — остальное поможем собрать.'}
            </p>
            <Button
              className="mt-5"
              variant={jobs.length ? 'outline' : 'default'}
              onClick={() => (jobs.length ? resetFilters() : onCreate('openai'))}
            >
              {jobs.length ? 'Сбросить поиск и фильтр' : 'Создать первую презентацию'}
            </Button>
          </div>
        ) : (
          <ul
            aria-label="Презентации"
            className="grid items-start gap-6 sm:grid-cols-2 xl:grid-cols-3"
          >
            {visibleJobs.map((job) => {
              const template = templates.find((template) => template.id === job.template_id)
              return (
                <PresentationCard
                  key={job.id}
                  job={job}
                  previewUrl={template?.preview_url}
                  templateName={template?.name ?? job.template_id}
                  models={models}
                  defaultModel={defaultModel}
                  openaiEnabled={openaiEnabled}
                  onResume={onResume}
                  onChanged={onChanged}
                  onError={onError}
                />
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
