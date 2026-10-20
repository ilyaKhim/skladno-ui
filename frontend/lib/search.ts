import type { TemplateRecord } from '@/lib/templates'

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Category name/key, slug, id and slide content are intentionally excluded.
export function buildTemplateSearchIndex(template: TemplateRecord) {
  return normalizeSearchText(
    [template.title, template.description, ...template.tags, ...template.useCases].join(' '),
  )
}

export function matchesSearchQuery(searchIndex: string, query: string) {
  const queryWords = normalizeSearchText(query).split(' ').filter(Boolean)
  return queryWords.every((word) => searchIndex.includes(word))
}
