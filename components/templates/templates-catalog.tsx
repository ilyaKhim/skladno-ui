'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'
import { TEMPLATE_CATEGORIES, getPublishedTemplates, type TemplateCategoryKey } from '@/lib/templates'
import { TemplateCard } from '@/components/templates/template-card'

type CategoryFilter = TemplateCategoryKey | 'all'

const CATEGORY_OPTIONS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'Все шаблоны' },
  ...TEMPLATE_CATEGORIES.map((category) => ({ key: category.key as CategoryFilter, label: category.label })),
]

const POPULAR_QUERIES = ['Отчёт', 'Коммерческое предложение', 'Стратегия', 'Питч', 'Маркетинг']

const PUBLISHED_TEMPLATES = getPublishedTemplates()

function isCategoryFilter(value: string | null): value is CategoryFilter {
  return value !== null && CATEGORY_OPTIONS.some((option) => option.key === value)
}

export function TemplatesCatalog() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  const categoryFromUrl = searchParams.get('category')
  const queryFromUrl = searchParams.get('q') ?? ''

  const [category, setCategory] = useState<CategoryFilter>(
    isCategoryFilter(categoryFromUrl) ? categoryFromUrl : 'all',
  )
  // `draft` is what is typed in the field; `query` is the applied search.
  const [draft, setDraft] = useState(queryFromUrl)
  const [query, setQuery] = useState(queryFromUrl)

  // Keeps local state in sync when the URL changes from outside this
  // component (back/forward navigation, a shared link with params).
  useEffect(() => {
    setCategory(isCategoryFilter(categoryFromUrl) ? categoryFromUrl : 'all')
  }, [categoryFromUrl])

  useEffect(() => {
    setQuery(queryFromUrl)
    setDraft(queryFromUrl)
  }, [queryFromUrl])

  const updateUrl = useCallback(
    (nextCategory: CategoryFilter, nextQuery: string) => {
      const params = new URLSearchParams(searchParams.toString())

      if (nextCategory !== 'all') {
        params.set('category', nextCategory)
      } else {
        params.delete('category')
      }

      if (nextQuery) {
        params.set('q', nextQuery)
      } else {
        params.delete('q')
      }

      const queryString = params.toString()
      // scroll: false keeps the page position when a filter changes.
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  function applySearch(value: string) {
    const next = value.trim()
    setDraft(value)
    setQuery(next)
    updateUrl(category, next)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    applySearch(draft)
  }

  function handleClear() {
    setDraft('')
    setQuery('')
    updateUrl(category, '')
    inputRef.current?.focus()
  }

  function handleCategoryChange(key: CategoryFilter) {
    setCategory(key)
    updateUrl(key, query)
  }

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return PUBLISHED_TEMPLATES.filter((template) => {
      const matchesCategory = category === 'all' || template.category === category
      if (!matchesCategory) return false
      if (!normalizedQuery) return true
      const haystack = [template.title, template.description, ...template.tags, ...template.useCases]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [category, query])

  return (
    <section className="bg-background">
      <div className="mx-auto max-w-[1360px] px-5 py-8 md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-[1040px] px-1">
          <form role="search" onSubmit={handleSubmit} className="flex items-center gap-3 md:gap-5">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              />
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Например: отчёт, коммерческое предложение, стратегия…"
                aria-label="Поиск шаблона по названию или назначению"
                className={cn(
                  'h-12 w-full rounded-xl border border-border bg-muted/50 pl-12 pr-12 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-primary md:h-14',
                  focusRing,
                )}
              />
              {draft ? (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Очистить поиск"
                  className={cn(
                    'absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    focusRing,
                  )}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </div>
            <Button
              type="submit"
              className={cn(
                'h-12 shrink-0 rounded-xl px-5 text-base font-semibold hover:brightness-90 md:h-14 md:px-9',
                focusRing,
              )}
            >
              Найти
            </Button>
          </form>

          <div
            role="group"
            aria-labelledby="popular-queries-label"
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
          >
            <span id="popular-queries-label" className="font-semibold text-foreground">
              Популярные запросы:
            </span>
            {POPULAR_QUERIES.map((popular) => (
              <button
                key={popular}
                type="button"
                onClick={() => applySearch(popular)}
                className={cn(
                  'rounded-sm py-1 text-muted-foreground transition-colors hover:text-primary',
                  focusRing,
                )}
              >
                {popular}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-8 md:mt-10 md:flex-row md:items-start md:gap-8 lg:gap-10">
          <nav
            aria-label="Категории шаблонов"
            className="examples-chip-row -mx-5 overflow-x-auto px-5 py-1.5 md:sticky md:top-20 md:mx-0 md:w-[220px] md:shrink-0 md:overflow-visible md:px-0 md:py-0 lg:w-[240px]"
          >
            <div className="flex gap-2 whitespace-nowrap md:flex-col md:gap-1.5 md:whitespace-normal">
              {CATEGORY_OPTIONS.map((option) => {
                const isActive = option.key === category
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleCategoryChange(option.key)}
                    aria-pressed={isActive}
                    className={cn(
                      'shrink-0 rounded-full border px-4 py-2 text-left text-sm font-medium transition-colors duration-200 md:w-full md:rounded-md md:border-0 md:border-l-2 md:px-3 md:py-2',
                      focusRing,
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground md:border-l-primary md:bg-primary/10 md:text-primary'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground md:border-l-transparent md:bg-transparent md:text-foreground md:hover:bg-muted',
                    )}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </nav>

          <div className="min-w-0 flex-1">
            {filteredTemplates.length > 0 ? (
              <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-5 lg:gap-6">
                {filteredTemplates.map((template) => (
                  <li key={template.id}>
                    <TemplateCard template={template} />
                  </li>
                ))}
              </ul>
            ) : (
              <div role="status" className="rounded-2xl bg-muted p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Ничего не найдено. Попробуйте другой запрос.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
