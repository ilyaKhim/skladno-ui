import type { PresentationJob } from './generation-types'

/** Keep only the fresh page and explicitly open outline cards, preserving their React keys. */
export function mergePresentationPage(
  incoming: PresentationJob[],
  current: PresentationJob[],
  retainedIds: ReadonlySet<string>,
  retainedUpdates: PresentationJob[] = [],
) {
  const result = new Map(incoming.map((job) => [job.id, job]))
  const updates = new Map(retainedUpdates.map((job) => [job.id, job]))
  for (const job of current) {
    if (retainedIds.has(job.id) && !result.has(job.id)) result.set(job.id, updates.get(job.id) ?? job)
  }
  return [...result.values()]
}

/** Explicitly closing a retained card drops it if it is no longer on the current server page. */
export function releasePresentationCards(
  current: PresentationJob[],
  pageIds: ReadonlySet<string>,
  retainedIds: ReadonlySet<string>,
) {
  return current.filter((job) => pageIds.has(job.id) || retainedIds.has(job.id))
}
