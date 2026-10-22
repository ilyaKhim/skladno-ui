export type LlmContent = {
  fields: Record<string, string>
  slides: { slide: number; include: boolean; reason: string }[]
}

type TemplateContext = { fields: Record<string, number>; slides: { slide: number }[] }

const ERRORS = {
  json: 'Не удалось прочитать JSON. Вставьте полный ответ OpenAI или JSON с fields и slides.',
  content: 'В ответе не найдено содержимое презентации с fields и slides.',
  incomplete: 'Ответ OpenAI не завершён. Вставьте завершённый ответ целиком.',
  provider: 'Этот ответ OpenAI содержит ошибку. Нужен успешный ответ с презентацией.',
  fields: 'Поля ответа не соответствуют выбранному шаблону.',
  slides: 'Для каждого слайда нужны уникальный целый номер, include и непустая reason.',
  selection: 'В ответе должен быть включён хотя бы один слайд.',
  markers: 'В тексте остались незаполненные маркеры {{…}}.',
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJson(text: string): unknown {
  const source = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1')
  try { return JSON.parse(source) }
  catch { throw new Error(ERRORS.json) }
}

/** Extract only slide content: API envelope, usage and other provider fields stay in the browser. */
export function parseLlmResponse(text: string, context?: TemplateContext): LlmContent {
  let value = readJson(text)
  if (!isObject(value)) throw new Error(ERRORS.content)
  if (value.error) throw new Error(ERRORS.provider)

  if (!('fields' in value && 'slides' in value)) {
    if (value.status !== undefined && value.status !== 'completed') throw new Error(ERRORS.incomplete)
    let content: string | undefined
    if (typeof value.output_text === 'string') content = value.output_text
    else if (Array.isArray(value.output)) {
      content = value.output.filter(isObject).flatMap((item) => Array.isArray(item.content) ? item.content : [])
        .filter(isObject).filter((part) => part.type === 'output_text' && typeof part.text === 'string')
        .map((part) => part.text as string).join('')
    } else if (Array.isArray(value.choices)) {
      const choice = value.choices[0]
      if (isObject(choice)) {
        if (choice.finish_reason && choice.finish_reason !== 'stop') throw new Error(ERRORS.incomplete)
        if (isObject(choice.message) && typeof choice.message.content === 'string') content = choice.message.content
      }
    }
    if (!content) throw new Error(ERRORS.content)
    value = readJson(content)
  }

  if (!isObject(value) || !isObject(value.fields) || !Array.isArray(value.slides)) throw new Error(ERRORS.content)
  if (Object.keys(value).some((key) => key !== 'fields' && key !== 'slides')) throw new Error(ERRORS.content)
  if (Object.values(value.fields).some((field) => typeof field !== 'string')) throw new Error(ERRORS.fields)
  const fields = value.fields as Record<string, string>
  if (Object.values(fields).some((field) => field.includes('{{') || field.includes('}}'))) throw new Error(ERRORS.markers)

  const seen = new Set<number>()
  const slides = value.slides.map((slide) => {
    if (!isObject(slide) || typeof slide.slide !== 'number' || !Number.isInteger(slide.slide) || slide.slide < 1
      || seen.has(slide.slide) || typeof slide.include !== 'boolean' || typeof slide.reason !== 'string' || !slide.reason.trim()
      || Object.keys(slide).some((key) => !['slide', 'include', 'reason'].includes(key))) throw new Error(ERRORS.slides)
    seen.add(slide.slide)
    return { slide: slide.slide, include: slide.include, reason: slide.reason }
  })
  if (!slides.some((slide) => slide.include)) throw new Error(ERRORS.selection)
  if (context) {
    const expected = Object.keys(context.fields)
    if (Object.keys(fields).length !== expected.length || expected.some((key) => !(key in fields))) throw new Error(ERRORS.fields)
    if (slides.length !== context.slides.length || context.slides.some((slide) => !seen.has(slide.slide))) throw new Error(ERRORS.slides)
  }
  return { fields, slides }
}
