export type TemplateCategoryKey =
  | 'reports'
  | 'proposals'
  | 'strategy'
  | 'projects'
  | 'sales'
  | 'research'
  | 'meetings'
  | 'marketing'

export type TemplateStatus = 'published' | 'draft'

export interface TemplateRecord {
  id: string
  slug: string
  title: string
  category: TemplateCategoryKey
  description: string
  /** 16:9 cover image, shown in the catalog card and as the first slide. */
  cover: string
  /**
   * Ordered slide images for the detail-page viewer. Currently equal to
   * `[cover]` for every template — only the cover exists so far. Add more
   * local image paths here later to enable the multi-slide viewer; no
   * component changes are required.
   */
  slides: string[]
  tags: string[]
  status: TemplateStatus
  useCases: string[]
}

export interface TemplateCategoryDef {
  key: TemplateCategoryKey
  label: string
}

/** "Все шаблоны" is handled separately in the UI — it is not a real category key. */
export const TEMPLATE_CATEGORIES: TemplateCategoryDef[] = [
  { key: 'reports', label: 'Отчёты и аналитика' },
  { key: 'proposals', label: 'Коммерческие предложения' },
  { key: 'strategy', label: 'Стратегии и планы' },
  { key: 'projects', label: 'Презентации проектов' },
  { key: 'sales', label: 'Продажи и питчи' },
  { key: 'research', label: 'Исследования' },
  { key: 'meetings', label: 'Совещания и обновления' },
  { key: 'marketing', label: 'Маркетинг' },
]

export const ALL_TEMPLATES_CATEGORY_KEY = 'all' as const

function makeSlide(cover: string): string[] {
  return [cover]
}

/**
 * Local template records. Covers reuse the same images already downloaded
 * into /public/template-previews/ for the homepage carousel — no new
 * assets are introduced here.
 */
export const TEMPLATES: TemplateRecord[] = [
  {
    id: 'reports-1',
    slug: 'reports-marketing-campaign-analysis',
    title: 'Marketing Campaign Analysis Report',
    category: 'reports',
    description:
      'Разбор результатов маркетинговой кампании: цели, метрики, выводы и рекомендации на следующий период.',
    cover: '/template-previews/reports-marketing-campaign-analysis.jpg',
    slides: makeSlide('/template-previews/reports-marketing-campaign-analysis.jpg'),
    tags: ['Отчёт', 'Маркетинг', 'Метрики'],
    status: 'published',
    useCases: [
      'Итоги рекламной кампании для руководства',
      'Разбор эффективности каналов продвижения',
      'Рекомендации на следующий период',
    ],
  },
  {
    id: 'reports-2',
    slug: 'reports-monthly-client-report',
    title: 'Monthly Client Report',
    category: 'reports',
    description: 'Ежемесячный отчёт для клиента: статус работ, ключевые показатели и следующие шаги.',
    cover: '/template-previews/reports-monthly-client-report.jpg',
    slides: makeSlide('/template-previews/reports-monthly-client-report.jpg'),
    tags: ['Отчёт', 'Клиенты', 'Ежемесячно'],
    status: 'published',
    useCases: [
      'Регулярная отчётность перед клиентом',
      'Статус текущих задач и договорённостей',
      'Прозрачная коммуникация по проекту',
    ],
  },
  {
    id: 'reports-3',
    slug: 'reports-mckinsey-consulting-report',
    title: 'McKinsey Consulting Report',
    category: 'reports',
    description: 'Строгий консалтинговый формат для аналитических отчётов с акцентом на структуру и данные.',
    cover: '/template-previews/reports-mckinsey-consulting-report.jpg',
    slides: makeSlide('/template-previews/reports-mckinsey-consulting-report.jpg'),
    tags: ['Отчёт', 'Консалтинг', 'Аналитика'],
    status: 'published',
    useCases: [
      'Аналитический отчёт для топ-менеджмента',
      'Презентация выводов консалтингового проекта',
      'Структурированная подача данных',
    ],
  },
  {
    id: 'proposals-1',
    slug: 'proposals-simple-business-proposal',
    title: 'Simple Business Proposal',
    category: 'proposals',
    description: 'Лаконичное коммерческое предложение: суть услуги, условия и следующий шаг для клиента.',
    cover: '/template-previews/proposals-simple-business-proposal.jpg',
    slides: makeSlide('/template-previews/proposals-simple-business-proposal.jpg'),
    tags: ['КП', 'Бизнес', 'Продажи'],
    status: 'published',
    useCases: [
      'Коммерческое предложение новому клиенту',
      'Презентация условий сотрудничества',
      'Быстрая отправка предложения после встречи',
    ],
  },
  {
    id: 'proposals-2',
    slug: 'proposals-it-software-sales-proposal',
    title: 'IT Software Sales Proposal',
    category: 'proposals',
    description: 'Коммерческое предложение для IT- и software-продуктов: функциональность, тарифы, внедрение.',
    cover: '/template-previews/proposals-it-software-sales-proposal.jpg',
    slides: makeSlide('/template-previews/proposals-it-software-sales-proposal.jpg'),
    tags: ['КП', 'IT', 'SaaS'],
    status: 'published',
    useCases: [
      'Продажа программного продукта',
      'Презентация тарифов и внедрения',
      'Предложение для технического заказчика',
    ],
  },
  {
    id: 'proposals-3',
    slug: 'proposals-public-relations-proposal',
    title: 'Public Relations Proposal',
    category: 'proposals',
    description: 'Предложение по PR-услугам: стратегия коммуникаций, каналы и ожидаемый результат.',
    cover: '/template-previews/proposals-public-relations-proposal.jpg',
    slides: makeSlide('/template-previews/proposals-public-relations-proposal.jpg'),
    tags: ['КП', 'PR', 'Коммуникации'],
    status: 'published',
    useCases: [
      'Предложение PR-стратегии клиенту',
      'Питч агентства по коммуникациям',
      'План работы со СМИ и инфополем',
    ],
  },
  {
    id: 'strategy-1',
    slug: 'strategy-go-to-market-strategy',
    title: 'Go-To-Market Strategy',
    category: 'strategy',
    description: 'План выхода продукта на рынок: целевая аудитория, каналы, сроки и метрики успеха.',
    cover: '/template-previews/strategy-go-to-market-strategy.jpg',
    slides: makeSlide('/template-previews/strategy-go-to-market-strategy.jpg'),
    tags: ['Стратегия', 'GTM', 'Продукт'],
    status: 'published',
    useCases: [
      'Запуск нового продукта или фичи',
      'Презентация плана выхода на рынок инвесторам',
      'Согласование GTM-плана с командой',
    ],
  },
  {
    id: 'strategy-2',
    slug: 'strategy-mckinsey-strategic-planning',
    title: 'McKinsey Strategic Planning',
    category: 'strategy',
    description: 'Формат стратегического планирования с акцентом на структуру, приоритеты и дорожную карту.',
    cover: '/template-previews/strategy-mckinsey-strategic-planning.jpg',
    slides: makeSlide('/template-previews/strategy-mckinsey-strategic-planning.jpg'),
    tags: ['Стратегия', 'Планирование', 'Консалтинг'],
    status: 'published',
    useCases: [
      'Стратегическая сессия с руководством',
      'Годовое стратегическое планирование',
      'Презентация приоритетов на квартал',
    ],
  },
  {
    id: 'strategy-3',
    slug: 'strategy-business-market-analysis',
    title: 'Business Market Analysis',
    category: 'strategy',
    description: 'Анализ рынка и конкурентов для обоснования стратегических решений.',
    cover: '/template-previews/strategy-business-market-analysis.jpg',
    slides: makeSlide('/template-previews/strategy-business-market-analysis.jpg'),
    tags: ['Стратегия', 'Рынок', 'Конкуренты'],
    status: 'published',
    useCases: [
      'Анализ рынка перед стратегическим решением',
      'Сравнение с конкурентами',
      'Обоснование стратегии перед советом директоров',
    ],
  },
  {
    id: 'projects-1',
    slug: 'projects-project-success-story',
    title: 'Project Success Story',
    category: 'projects',
    description: 'Презентация успешного кейса: задача, решение и измеримый результат проекта.',
    cover: '/template-previews/projects-project-success-story.jpg',
    slides: makeSlide('/template-previews/projects-project-success-story.jpg'),
    tags: ['Проект', 'Кейс', 'Результат'],
    status: 'published',
    useCases: [
      'Кейс для клиента или инвестора',
      'Демонстрация успешного проекта команде',
      'Материал для портфолио',
    ],
  },
  {
    id: 'projects-2',
    slug: 'projects-project-action-plan',
    title: 'Project Action Plan',
    category: 'projects',
    description: 'План действий по проекту: задачи, ответственные и сроки на каждом этапе.',
    cover: '/template-previews/projects-project-action-plan.jpg',
    slides: makeSlide('/template-previews/projects-project-action-plan.jpg'),
    tags: ['Проект', 'План', 'Задачи'],
    status: 'published',
    useCases: [
      'Запуск нового проекта',
      'Распределение задач по команде',
      'Согласование плана с заказчиком',
    ],
  },
  {
    id: 'projects-3',
    slug: 'projects-project-roadmap',
    title: 'Project Roadmap',
    category: 'projects',
    description: 'Дорожная карта проекта с этапами, milestone-ами и сроками выполнения.',
    cover: '/template-previews/projects-project-roadmap.jpg',
    slides: makeSlide('/template-previews/projects-project-roadmap.jpg'),
    tags: ['Проект', 'Roadmap', 'Сроки'],
    status: 'published',
    useCases: [
      'Презентация дорожной карты команде',
      'Планирование релизов и этапов',
      'Обновление статуса для стейкхолдеров',
    ],
  },
  {
    id: 'sales-1',
    slug: 'sales-stylish-pitch-deck',
    title: 'Stylish Pitch Deck',
    category: 'sales',
    description: 'Питч-дек в ярком стиле для презентации продукта или бизнеса инвесторам.',
    cover: '/template-previews/sales-stylish-pitch-deck.jpg',
    slides: makeSlide('/template-previews/sales-stylish-pitch-deck.jpg'),
    tags: ['Питч', 'Инвесторы', 'Продукт'],
    status: 'published',
    useCases: [
      'Питч стартапа инвесторам',
      'Презентация продукта на демо-дне',
      'Привлечение раунда финансирования',
    ],
  },
  {
    id: 'sales-2',
    slug: 'sales-minimalist-pitch-deck',
    title: 'Minimalist Pitch Deck',
    category: 'sales',
    description: 'Минималистичный питч-дек, где акцент на фактах и цифрах, а не на оформлении.',
    cover: '/template-previews/sales-minimalist-pitch-deck.jpg',
    slides: makeSlide('/template-previews/sales-minimalist-pitch-deck.jpg'),
    tags: ['Питч', 'Минимализм', 'Продажи'],
    status: 'published',
    useCases: [
      'Короткий питч на встрече',
      'Презентация продукта клиенту',
      'Сжатая версия дека для email',
    ],
  },
  {
    id: 'sales-3',
    slug: 'sales-elegant-pitch-deck',
    title: 'Elegant Pitch Deck',
    category: 'sales',
    description: 'Элегантный питч-дек для брендов и продуктов с фокусом на визуальную подачу.',
    cover: '/template-previews/sales-elegant-pitch-deck.jpg',
    slides: makeSlide('/template-previews/sales-elegant-pitch-deck.jpg'),
    tags: ['Питч', 'Бренд', 'Дизайн'],
    status: 'published',
    useCases: ['Презентация бренда партнёрам', 'Питч премиального продукта', 'Дек для встречи с инвестором'],
  },
  {
    id: 'research-1',
    slug: 'research-startup-market-research',
    title: 'Startup Market Research',
    category: 'research',
    description: 'Исследование рынка для стартапа: объём рынка, аудитория и точки роста.',
    cover: '/template-previews/research-startup-market-research.jpg',
    slides: makeSlide('/template-previews/research-startup-market-research.jpg'),
    tags: ['Исследование', 'Стартап', 'Рынок'],
    status: 'published',
    useCases: [
      'Обоснование гипотезы стартапа',
      'Презентация исследования рынка инвесторам',
      'Анализ размера рынка (TAM/SAM/SOM)',
    ],
  },
  {
    id: 'research-2',
    slug: 'research-market-research-report',
    title: 'Market Research Report',
    category: 'research',
    description: 'Развёрнутый отчёт по исследованию рынка с выводами и рекомендациями.',
    cover: '/template-previews/research-market-research-report.jpg',
    slides: makeSlide('/template-previews/research-market-research-report.jpg'),
    tags: ['Исследование', 'Отчёт', 'Данные'],
    status: 'published',
    useCases: [
      'Отчёт по маркетинговому исследованию',
      'Презентация результатов опроса или анализа',
      'Материал для стратегической сессии',
    ],
  },
  {
    id: 'research-3',
    slug: 'research-b2b-market-research',
    title: 'B2B Market Research',
    category: 'research',
    description: 'Исследование B2B-рынка: сегменты клиентов, потребности и конкурентное окружение.',
    cover: '/template-previews/research-b2b-market-research.jpg',
    slides: makeSlide('/template-previews/research-b2b-market-research.jpg'),
    tags: ['Исследова��ие', 'B2B', 'Сегменты'],
    status: 'published',
    useCases: [
      'Анализ B2B-сегментов перед запуском продукта',
      'Презентация исследования отделу продаж',
      'Оценка конкурентного окружения',
    ],
  },
  {
    id: 'meetings-1',
    slug: 'meetings-year-end-review-business-meeting',
    title: 'Year-end Review Business Meeting',
    category: 'meetings',
    description: 'Итоги года для команды или совета директоров: результаты, цифры и планы на следующий год.',
    cover: '/template-previews/meetings-year-end-review-business-meeting.jpg',
    slides: makeSlide('/template-previews/meetings-year-end-review-business-meeting.jpg'),
    tags: ['Совещание', 'Итоги года', 'Отчёт'],
    status: 'published',
    useCases: [
      'Годовое собрание команды',
      'Отчёт перед советом директоров',
      'Презентация итогов года инвесторам',
    ],
  },
  {
    id: 'meetings-2',
    slug: 'meetings-quarterly-business-review',
    title: 'Quarterly Business Review',
    category: 'meetings',
    description: 'Квартальный обзор бизнеса: показатели, статус целей и приоритеты на следующий квартал.',
    cover: '/template-previews/meetings-quarterly-business-review.jpg',
    slides: makeSlide('/template-previews/meetings-quarterly-business-review.jpg'),
    tags: ['Совещание', 'QBR', 'Показатели'],
    status: 'published',
    useCases: [
      'Квартальное совещание с руководством',
      'Обзор бизнеса с ключевым клиентом',
      'Синхронизация целей команды',
    ],
  },
  {
    id: 'meetings-3',
    slug: 'meetings-simple-meeting-agenda',
    title: 'Simple Meeting Agenda',
    category: 'meetings',
    description: 'Простая структура повестки встречи: темы, тайминг и ответственные.',
    cover: '/template-previews/meetings-simple-meeting-agenda.jpg',
    slides: makeSlide('/template-previews/meetings-simple-meeting-agenda.jpg'),
    tags: ['Совещание', 'Повестка', 'Планирование'],
    status: 'published',
    useCases: [
      'Повестка регулярной встречи команды',
      'Планирование рабочей сессии',
      'Синхронизация перед проектной встречей',
    ],
  },
  {
    id: 'marketing-1',
    slug: 'marketing-simple-marketing-plan',
    title: 'Simple Marketing Plan',
    category: 'marketing',
    description: 'Простой маркетинговый план: цели, аудитория, каналы и бюджет на период.',
    cover: '/template-previews/marketing-simple-marketing-plan.jpg',
    slides: makeSlide('/template-previews/marketing-simple-marketing-plan.jpg'),
    tags: ['Маркетинг', 'План', 'Каналы'],
    status: 'published',
    useCases: [
      'Маркетинговый план на квартал',
      'Презентация плана продвижения руководству',
      'Согласование бюджета с командой',
    ],
  },
  {
    id: 'marketing-2',
    slug: 'marketing-advertising-and-marketing-plan',
    title: 'Advertising and Marketing Plan',
    category: 'marketing',
    description: 'Комплексный план рекламы и маркетинга: стратегия, каналы, календарь активностей.',
    cover: '/template-previews/marketing-advertising-and-marketing-plan.jpg',
    slides: makeSlide('/template-previews/marketing-advertising-and-marketing-plan.jpg'),
    tags: ['Маркетинг', 'Реклама', 'Календарь'],
    status: 'published',
    useCases: [
      'Годовой рекламный план',
      'Презентация маркетинговой стратегии',
      'Планирование рекламных активностей',
    ],
  },
  {
    id: 'marketing-3',
    slug: 'marketing-advertising-report',
    title: 'Advertising Report',
    category: 'marketing',
    description: 'Отчёт по рекламным активностям: результаты кампаний, расходы и эффективность каналов.',
    cover: '/template-previews/marketing-advertising-report.jpg',
    slides: makeSlide('/template-previews/marketing-advertising-report.jpg'),
    tags: ['Маркетинг', 'Реклама', 'Отчёт'],
    status: 'published',
    useCases: [
      'Отчёт по рекламному бюджету',
      'Анализ эффективности рекламных каналов',
      'Презентация результатов кампании клиенту',
    ],
  },
]

export function getPublishedTemplates(): TemplateRecord[] {
  return TEMPLATES.filter((template) => template.status === 'published')
}

export function getTemplateBySlug(slug: string): TemplateRecord | undefined {
  return TEMPLATES.find((template) => template.slug === slug && template.status === 'published')
}

export function getCategoryLabel(key: TemplateCategoryKey): string {
  return TEMPLATE_CATEGORIES.find((category) => category.key === key)?.label ?? key
}

export function getRelatedTemplates(template: TemplateRecord, limit = 3): TemplateRecord[] {
  const published = getPublishedTemplates().filter((t) => t.id !== template.id)
  const sameCategory = published.filter((t) => t.category === template.category)
  const rest = published.filter((t) => t.category !== template.category)
  return [...sameCategory, ...rest].slice(0, limit)
}
