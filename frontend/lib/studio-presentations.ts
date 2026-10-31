import type { PresentationJob } from './generation-types'

export type PresentationFilter = 'all' | 'draft' | 'succeeded' | 'processing'
export type PresentationSort = 'newest' | 'oldest' | 'title'

/** Filters the loaded recent page, without mutating server order or implying global search. */
export function selectPresentations(
  jobs: PresentationJob[],
  query: string,
  filter: PresentationFilter,
  sort: PresentationSort,
) {
  const search = query.trim().toLocaleLowerCase('ru-RU')
  return jobs
    .filter((job) => {
      const matchesStatus =
        filter === 'all' ||
        (filter === 'draft'
          ? job.status === 'draft' || job.status === 'awaiting_content'
          : filter === 'processing'
            ? job.status === 'queued' || job.status === 'running'
            : job.status === filter)
      return matchesStatus && job.topic.toLocaleLowerCase('ru-RU').includes(search)
    })
    .sort((a, b) =>
      sort === 'title'
        ? a.topic.localeCompare(b.topic, 'ru')
        : sort === 'oldest'
          ? a.created_at - b.created_at
          : b.created_at - a.created_at,
    )
}
