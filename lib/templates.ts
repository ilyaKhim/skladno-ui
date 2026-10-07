export type TemplateCategoryKey =
  | 'reports'
  | 'proposals'
  | 'strategy'
  | 'projects'
  | 'sales'
  | 'research'
  | 'meetings'
  | 'marketing'
  | 'training'

export type TemplateStatus = 'published' | 'draft'

export interface TemplateRecord {
  id: string
  slug: string
  title: string
  category: TemplateCategoryKey
  description: string
  /** First 16:9 slide, also shown as the catalog cover. */
  cover: string
  /** Ordered WebP slide images for the detail-page viewer. */
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
  { key: 'training', label: 'Обучение и инструкции' },
]

export const ALL_TEMPLATES_CATEGORY_KEY = 'all' as const

function slidePath(slug: string, slideNumber: number): string {
  return `/template-previews/${slug}/slide-${String(slideNumber).padStart(2, '0')}.webp`
}

function makeSlides(slug: string, slideCount: number): string[] {
  return Array.from({ length: slideCount }, (_, index) => slidePath(slug, index + 1))
}

/**
 * Local template records. Each published template points to its complete
 * ordered WebP slide set under /public/template-previews/<slug>/.
 */
export const TEMPLATES: TemplateRecord[] = [
  {
    id: 'reports-1',
    slug: 'reports-marketing-campaign-analysis',
    title: 'Marketing Campaign Analysis Report',
    category: 'reports',
    description:
      'Разбор результатов маркетинговой кампании: цели, метрики, выводы и рекомендации на следующий период.',
    cover: slidePath('reports-marketing-campaign-analysis', 1),
    slides: makeSlides('reports-marketing-campaign-analysis', 14),
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
    cover: slidePath('reports-monthly-client-report', 1),
    slides: makeSlides('reports-monthly-client-report', 15),
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
    cover: slidePath('reports-mckinsey-consulting-report', 1),
    slides: makeSlides('reports-mckinsey-consulting-report', 8),
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
    cover: slidePath('proposals-simple-business-proposal', 1),
    slides: makeSlides('proposals-simple-business-proposal', 17),
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
    cover: slidePath('proposals-it-software-sales-proposal', 1),
    slides: makeSlides('proposals-it-software-sales-proposal', 14),
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
    cover: slidePath('proposals-public-relations-proposal', 1),
    slides: makeSlides('proposals-public-relations-proposal', 19),
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
    cover: slidePath('strategy-go-to-market-strategy', 1),
    slides: makeSlides('strategy-go-to-market-strategy', 15),
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
    cover: slidePath('strategy-mckinsey-strategic-planning', 1),
    slides: makeSlides('strategy-mckinsey-strategic-planning', 15),
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
    cover: slidePath('strategy-business-market-analysis', 1),
    slides: makeSlides('strategy-business-market-analysis', 20),
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
    cover: slidePath('projects-project-success-story', 1),
    slides: makeSlides('projects-project-success-story', 20),
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
    cover: slidePath('projects-project-action-plan', 1),
    slides: makeSlides('projects-project-action-plan', 19),
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
    cover: slidePath('projects-project-roadmap', 1),
    slides: makeSlides('projects-project-roadmap', 21),
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
    cover: slidePath('sales-stylish-pitch-deck', 1),
    slides: makeSlides('sales-stylish-pitch-deck', 38),
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
    cover: slidePath('sales-minimalist-pitch-deck', 1),
    slides: makeSlides('sales-minimalist-pitch-deck', 18),
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
    cover: slidePath('sales-elegant-pitch-deck', 1),
    slides: makeSlides('sales-elegant-pitch-deck', 34),
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
    cover: slidePath('research-startup-market-research', 1),
    slides: makeSlides('research-startup-market-research', 20),
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
    cover: slidePath('research-market-research-report', 1),
    slides: makeSlides('research-market-research-report', 19),
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
    cover: slidePath('research-b2b-market-research', 1),
    slides: makeSlides('research-b2b-market-research', 20),
    tags: ['Исследова����ие', 'B2B', 'Сегменты'],
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
    cover: slidePath('meetings-year-end-review-business-meeting', 1),
    slides: makeSlides('meetings-year-end-review-business-meeting', 14),
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
    cover: slidePath('meetings-quarterly-business-review', 1),
    slides: makeSlides('meetings-quarterly-business-review', 17),
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
    slides: ['/template-previews/meetings-simple-meeting-agenda.jpg'],
    tags: ['Совещание', 'Повестка', 'Планирование'],
    status: 'draft',
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
    slides: ['/template-previews/marketing-simple-marketing-plan.jpg'],
    tags: ['Маркетинг', 'План', 'Каналы'],
    status: 'draft',
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
    cover: slidePath('marketing-advertising-and-marketing-plan', 1),
    slides: makeSlides('marketing-advertising-and-marketing-plan', 21),
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
    cover: slidePath('marketing-advertising-report', 1),
    slides: makeSlides('marketing-advertising-report', 21),
    tags: ['Маркетинг', 'Реклама', 'Отчёт'],
    status: 'published',
    useCases: [
      'Отчёт по рекламному бюджету',
      'Анализ эффективности рекламных каналов',
      'Презентация результатов кампании клиенту',
    ],
  },
  {
    id: 'training-1',
    slug: 'bold-geometric-fraction-flashcards',
    title: 'Bold Geometric Fraction Flashcards',
    category: 'training',
    description: 'Яркий геометрический шаблон карточек для объяснения и закрепления дробей.',
    cover: slidePath('bold-geometric-fraction-flashcards', 1),
    slides: makeSlides('bold-geometric-fraction-flashcards', 20),
    tags: ['Обучение', 'Математика', 'Карточки'],
    status: 'published',
    useCases: [
      'Объяснение дробей на уроке или тренинге',
      'Практические задания и самостоятельная работа',
      'Карточки для повторения материала',
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
