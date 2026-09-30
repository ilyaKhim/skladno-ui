'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { TEMPLATE_CATEGORIES, getPublishedTemplates, type TemplateCategoryKey } from '@/lib/templates'
import { TemplateCard } from '@/components/templates/template-card'

type CategoryFilter = TemplateCategoryKey | 'all'

const CATEGORY_OPTIONS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'Все шаблоны' },
  ...TEMPLATE_CATEGORIES.map((category) => ({ key: category.key as CategoryFilter, label: category.label })),
]

const PUBLISHED_TEMPLATES = getPublishedTemplates()

function isCategoryFilter(value: string | null): value is CategoryFilter {
  return value !== null && CATEGORY_OPTIONS.some((option) => option.key === value)
}

export function TemplatesCatalog() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const categoryFromUrl = searchParams.get('category')
  const queryFromUrl = searchParams.get('q') ?? ''

  const [category, setCategory] = useState<CategoryFilter>(
    isCategoryFilter(categoryFromUrl) ? categoryFromUrl : 'all',
  )
  const [query, setQuery] = useState(queryFromUrl)

  // Keeps local state in sync when the URL changes from outside this
  // component (back/forward navigation, a shared link with params).
  useEffect(() => {
    setCategory(isCategoryFilter(categoryFromUrl) ? categoryFromUrl : 'all')
  }, [categoryFromUrl])

  useEffect(() => {
    setQuery(queryFromUrl)
  }, [queryFromUrl])

  const updateUrl = useCallback(
    (next: { category?: CategoryFilter; q?: string }) => {
      const params = new URLSearchParams(searchParams.toString())
      const nextCategory = next.category ?? category
      const nextQuery = next.q ?? query

      if (nextCategory && nextCategory !== 'all') {
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
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
    },
    [category, pathname, query, router, searchParams],
  )

  function handleCategoryChange(key: CategoryFilter) {
    setCategory(key)
    updateUrl({ category: key })
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    updateUrl({ q: value })
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
      <div className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">
        <div className="relative w-full md:max-w-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="Поиск по названию или задаче"
            aria-label="Поиск шаблона по названию или назначению"
            className="h-10 pl-9"
          />
        </div>

        <nav
          aria-label="Категории шаблонов"
          className="examples-chip-row -mx-5 mt-6 overflow-x-auto px-5 pb-1 md:mx-0 md:overflow-visible md:px-0"
        >
          <div className="flex gap-2 whitespace-nowrap md:flex-wrap md:whitespace-normal">
            {CATEGORY_OPTIONS.map((option) => {
              const isActive = option.key === category
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => handleCategoryChange(option.key)}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </nav>

        <p className="mt-6 text-sm text-muted-foreground" role="status">
          {filteredTemplates.length > 0
            ? `Найдено шаблонов: ${filteredTemplates.length}`
            : 'По вашему запросу ничего не найдено'}
        </p>

        {filteredTemplates.length > 0 ? (
          <ul className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => (
              <li key={template.id}>
                <TemplateCard template={template} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Попробуйте изменить запрос или выбрать другую категорию.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
