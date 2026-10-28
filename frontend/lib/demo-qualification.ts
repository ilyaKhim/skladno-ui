export type DemoModalStep =
  | 'intro'
  | 'role'
  | 'use-case'
  | 'pain'
  | 'frequency'
  | 'team'
  | 'result'
  | 'booking'

export type DemoQualification = {
  role?: string
  useCases: string[]
  pain?: string
  frequency?: string
  teamSize?: string
}

export type DemoQuestionStep = Extract<DemoModalStep, 'role' | 'use-case' | 'pain' | 'frequency' | 'team'>

type DemoOption = { value: string; label: string }

type DemoQuestion = {
  step: DemoQuestionStep
  title: string
  hint?: string
  multiple: boolean
  options: DemoOption[]
}

export const DEMO_QUESTION_STEPS: DemoQuestionStep[] = ['role', 'use-case', 'pain', 'frequency', 'team']

export const DEMO_QUESTIONS: Record<DemoQuestionStep, DemoQuestion> = {
  role: {
    step: 'role',
    title: 'Чем вы занимаетесь?',
    multiple: false,
    options: [
      { value: 'leader', label: 'Руководитель или предприниматель' },
      { value: 'sales', label: 'Продажи' },
      { value: 'marketing', label: 'Маркетинг' },
      { value: 'analytics', label: 'Аналитика или консалтинг' },
      { value: 'project-management', label: 'Управление проектами' },
      { value: 'hr-learning', label: 'HR или обучение' },
      { value: 'other', label: 'Другое' },
    ],
  },
  'use-case': {
    step: 'use-case',
    title: 'Какие презентации вы создаёте чаще всего?',
    hint: 'Можно выбрать несколько вариантов',
    multiple: true,
    options: [
      { value: 'sales-proposals', label: 'Коммерческие предложения' },
      { value: 'reports', label: 'Отчёты и аналитика' },
      { value: 'strategy', label: 'Стратегии и планы' },
      { value: 'projects', label: 'Презентации проектов' },
      { value: 'meetings', label: 'Материалы для встреч' },
      { value: 'learning', label: 'Обучающие материалы' },
      { value: 'other', label: 'Другое' },
    ],
  },
  pain: {
    step: 'pain',
    title: 'Что сейчас отнимает больше всего времени?',
    multiple: false,
    options: [
      { value: 'structure', label: 'Сборка структуры из исходных материалов' },
      { value: 'copywriting', label: 'Написание и сокращение текста' },
      { value: 'design', label: 'Оформление слайдов' },
      { value: 'audience', label: 'Адаптация под задачу и аудиторию' },
      { value: 'brand', label: 'Соблюдение фирменного стиля' },
      { value: 'revisions', label: 'Правки и пересборка презентации' },
    ],
  },
  frequency: {
    step: 'frequency',
    title: 'Как часто вы создаёте презентации?',
    multiple: false,
    options: [
      { value: 'yearly', label: 'Несколько раз в год' },
      { value: 'monthly', label: '1–3 раза в месяц' },
      { value: 'weekly', label: 'Каждую неделю' },
      { value: 'several-per-week', label: 'Несколько раз в неделю' },
    ],
  },
  team: {
    step: 'team',
    title: 'Для кого вы рассматриваете GoDeck?',
    multiple: false,
    options: [
      { value: 'personal', label: 'Только для себя' },
      { value: 'team-small', label: 'Для команды до 5 человек' },
      { value: 'team-medium', label: 'Для команды от 6 до 20 человек' },
      { value: 'company', label: 'Для подразделения или компании' },
      { value: 'researching', label: 'Пока просто изучаю продукт' },
    ],
  },
}

export const EMPTY_QUALIFICATION: DemoQualification = { useCases: [] }

export function isQuestionAnswered(step: DemoQuestionStep, data: DemoQualification): boolean {
  switch (step) {
    case 'role':
      return Boolean(data.role)
    case 'use-case':
      return data.useCases.length > 0
    case 'pain':
      return Boolean(data.pain)
    case 'frequency':
      return Boolean(data.frequency)
    case 'team':
      return Boolean(data.teamSize)
  }
}

export function isQualificationComplete(data: DemoQualification): boolean {
  return DEMO_QUESTION_STEPS.every((step) => isQuestionAnswered(step, data))
}

const RESULT_TITLES: Record<string, string> = {
  'sales-proposals': 'Покажем, как быстрее создавать коммерческие предложения',
  reports: 'Покажем, как собирать отчёты без ручной пересборки слайдов',
  strategy: 'Покажем, как превращать материалы в понятную стратегическую презентацию',
  projects: 'Покажем, как быстро упаковывать проекты в готовую презентацию',
  meetings: 'Покажем, как готовить материалы к встречам без часов в PowerPoint',
  learning: 'Покажем, как создавать структурированные обучающие материалы',
}

const RESULT_DESCRIPTIONS: Record<string, string> = {
  structure:
    'Разберём, как GoDeck выделяет главное из исходных материалов, выстраивает структуру и собирает редактируемые слайды.',
  copywriting:
    'Разберём, как GoDeck помогает сократить материалы, сформулировать основные мысли и распределить их по слайдам.',
  design: 'Покажем, как GoDeck оформляет содержание в готовые слайды без ручной работы с каждым элементом.',
  audience: 'Покажем, как адаптировать структуру, акценты и аргументацию под конкретную задачу и аудиторию.',
  brand: 'Покажем, как применять корпоративные цвета, шрифты и шаблоны ко всей презентации.',
  revisions: 'Покажем, как менять структуру, текст и оформление презентации без полной ручной пересборки.',
}

const FALLBACK_TITLE = 'Покажем GoDeck на вашей задаче'
const FALLBACK_DESCRIPTION =
  'Разберём, как GoDeck собирает структуру, текст и оформление презентации под вашу задачу.'

export function getDemoResultCopy(data: DemoQualification): { title: string; description: string } {
  // The first selected type is the primary one; "other" has no tailored headline,
  // so it falls through to the next selected type that does.
  const primary = data.useCases.find((value) => RESULT_TITLES[value])
  const firstSelected = data.useCases[0]
  const titleKey = RESULT_TITLES[firstSelected] ? firstSelected : primary

  return {
    title: titleKey ? RESULT_TITLES[titleKey] : FALLBACK_TITLE,
    description: (data.pain && RESULT_DESCRIPTIONS[data.pain]) || FALLBACK_DESCRIPTION,
  }
}

const STORAGE_KEY = 'godeck:demo-qualification:v1'

function allowedValues(step: DemoQuestionStep): string[] {
  return DEMO_QUESTIONS[step].options.map((option) => option.value)
}

function pickOne(value: unknown, step: DemoQuestionStep): string | undefined {
  return typeof value === 'string' && allowedValues(step).includes(value) ? value : undefined
}

export function loadDemoQualification(): DemoQualification {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_QUALIFICATION
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return EMPTY_QUALIFICATION
    const source = parsed as Record<string, unknown>
    const allowedUseCases = allowedValues('use-case')
    const useCases = Array.isArray(source.useCases)
      ? source.useCases.filter(
          (value, index, list): value is string =>
            typeof value === 'string' && allowedUseCases.includes(value) && list.indexOf(value) === index,
        )
      : []

    return {
      role: pickOne(source.role, 'role'),
      useCases,
      pain: pickOne(source.pain, 'pain'),
      frequency: pickOne(source.frequency, 'frequency'),
      teamSize: pickOne(source.teamSize, 'team'),
    }
  } catch {
    return EMPTY_QUALIFICATION
  }
}

export function saveDemoQualification(data: DemoQualification): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage can be unavailable (private mode, quota); answers then live only in component state.
  }
}

const PLANERKA_DEMO_URL =
  process.env.NEXT_PUBLIC_PLANERKA_DEMO_URL ?? 'https://planerka.app/ilya-himchenko-flk6ha/30min'

const PLANERKA_QUALIFICATION_PARAM = 'qualification'
const SUMMARY_SOURCE = 'Источник: GoDeck landing'

const SKIPPED_QUALIFICATION_SUMMARY = `Анкета пропущена | ${SUMMARY_SOURCE}`

function labelFor(step: DemoQuestionStep, value: string | undefined): string {
  return DEMO_QUESTIONS[step].options.find((option) => option.value === value)?.label ?? ''
}

function buildQualificationSummary(data: DemoQualification): string {
  const useCases = data.useCases.map((value) => labelFor('use-case', value)).filter(Boolean)

  return [
    `Роль: ${labelFor('role', data.role)}`,
    `Презентации: ${useCases.join(', ')}`,
    `Основная проблема: ${labelFor('pain', data.pain)}`,
    `Частота: ${labelFor('frequency', data.frequency)}`,
    `Масштаб: ${labelFor('team', data.teamSize)}`,
    SUMMARY_SOURCE,
  ].join(' | ')
}

/** The only place that turns a qualification summary into a Planerka booking URL. */
function buildPlanerkaBookingUrl(summary: string): string {
  const url = new URL(PLANERKA_DEMO_URL)
  url.searchParams.set(PLANERKA_QUALIFICATION_PARAM, summary)
  return url.toString()
}

export function getPlanerkaBookingUrl(data: DemoQualification, skipped: boolean): string {
  return buildPlanerkaBookingUrl(skipped ? SKIPPED_QUALIFICATION_SUMMARY : buildQualificationSummary(data))
}
