import type { ReactNode } from 'react'
import {
  SlideBullets,
  SlideEyebrow,
  SlideFrame,
  SlideStages,
  SlideTakeaway,
  SlideTitle,
} from '@/components/slide-frame'

export type Scenario = {
  id: string
  chip: string
  prompt: string
  files: string[]
  outline: string[]
  slides: ReactNode[]
}

/**
 * Central source for the hero product-demo and the "Три шага" story.
 * All figures are illustrative — the UI labels the preview as an example.
 */
export const scenarios: Scenario[] = [
  {
    id: 'proposal',
    chip: 'КП клиенту',
    prompt: 'Сделай коммерческое предложение по брифу на обновление корпоративного сайта.',
    files: ['бриф.docx', 'прайс.xlsx'],
    outline: ['Титульный слайд', 'Состав работ и этапы', 'Сроки и стоимость', 'Следующий шаг'],
    slides: [
      <SlideFrame dense key="proposal-1">
        <SlideEyebrow>Коммерческое предложение</SlideEyebrow>
        <SlideTitle>Обновление корпоративного сайта</SlideTitle>
        <SlideStages
          items={[
            { label: 'Аудит и структура', note: 'Карта разделов' },
            { label: 'Дизайн и вёрстка', note: 'Ключевые экраны' },
            { label: 'Запуск', note: 'Перенос контента' },
          ]}
        />
        <SlideTakeaway>Работа разбита на три этапа с отдельной приёмкой.</SlideTakeaway>
      </SlideFrame>,
      <SlideFrame dense key="proposal-2">
        <SlideEyebrow>Сроки и объём</SlideEyebrow>
        <SlideTitle>Планируемый график</SlideTitle>
        <SlideBullets
          items={[
            'Аудит и структура — 2 недели',
            'Дизайн и вёрстка — 5 недель',
            'Запуск и передача — 2 недели',
          ]}
        />
        <SlideTakeaway>Около 9 недель при согласовании макетов за три дня.</SlideTakeaway>
      </SlideFrame>,
    ],
  },
  {
    id: 'report',
    chip: 'Отчёт руководителю',
    prompt: 'Собери отчёт за квартал по выгрузке заявок и рабочим заметкам.',
    files: ['заявки-q1.xlsx', 'заметки.docx'],
    outline: ['Ключевые итоги', 'Динамика по месяцам', 'Выводы и шаги'],
    slides: [
      <SlideFrame dense key="report-1">
        <SlideEyebrow>Отчёт за квартал</SlideEyebrow>
        <SlideTitle>Объём растёт без расширения команды</SlideTitle>
        <SlideStages
          items={[
            { label: '34 заявки', note: 'закрыто за квартал' },
            { label: '5 часов', note: 'среднее время ответа' },
            { label: '2 процесса', note: 'в регламенте' },
          ]}
        />
        <SlideTakeaway>Прирост дали регламенты, а не новые сотрудники.</SlideTakeaway>
      </SlideFrame>,
      <SlideFrame dense key="report-2">
        <SlideEyebrow>Выводы</SlideEyebrow>
        <SlideTitle>Что делаем дальше</SlideTitle>
        <SlideBullets
          items={[
            'Описать регламентом ещё два процесса',
            'Вынести типовые вопросы в базу знаний',
            'Вернуться к найму при загрузке выше 40 заявок',
          ]}
        />
        <SlideTakeaway>Узкое место — в описании процессов, а не в людях.</SlideTakeaway>
      </SlideFrame>,
    ],
  },
  {
    id: 'project',
    chip: 'Презентация проекта',
    prompt: 'Подготовь презентацию статуса проекта для команды и заказчика.',
    files: ['статус.docx'],
    outline: ['Цель и рамки', 'Что сделано', 'Риски и план'],
    slides: [
      <SlideFrame dense key="project-1">
        <SlideEyebrow>Статус проекта</SlideEyebrow>
        <SlideTitle>Где мы находимся сейчас</SlideTitle>
        <SlideStages
          items={[
            { label: 'Этап 2 из 4', note: 'по плану' },
            { label: '12 задач', note: 'закрыто за спринт' },
            { label: '1 риск', note: 'на контроле' },
          ]}
        />
        <SlideTakeaway>Проект идёт в графике, критичных блокеров нет.</SlideTakeaway>
      </SlideFrame>,
      <SlideFrame dense key="project-2">
        <SlideEyebrow>Риски и план</SlideEyebrow>
        <SlideTitle>Ближайшие шаги</SlideTitle>
        <SlideBullets
          items={[
            'Согласовать интеграцию со смежной командой',
            'Заложить буфер на приёмку в конце этапа',
            'Показать демо заказчику через две недели',
          ]}
        />
        <SlideTakeaway>Главный риск закрывается ранним согласованием интеграции.</SlideTakeaway>
      </SlideFrame>,
    ],
  },
  {
    id: 'strategy',
    chip: 'Стратегия',
    prompt: 'Оформи стратегию на год из черновика тезисов в заметках.',
    files: ['тезисы.txt'],
    outline: ['Контекст', 'Три приоритета', 'Ресурсы и метрики'],
    slides: [
      <SlideFrame dense key="strategy-1">
        <SlideEyebrow>Стратегия на год</SlideEyebrow>
        <SlideTitle>Три приоритета направления</SlideTitle>
        <SlideStages
          items={[
            { label: 'Удержание', note: 'снизить отток' },
            { label: 'Процессы', note: 'убрать ручной труд' },
            { label: 'Команда', note: 'усилить экспертизу' },
          ]}
        />
        <SlideTakeaway>Фокус на удержании даёт результат быстрее расширения.</SlideTakeaway>
      </SlideFrame>,
      <SlideFrame dense key="strategy-2">
        <SlideEyebrow>Ресурсы и метрики</SlideEyebrow>
        <SlideTitle>Как поймём, что получилось</SlideTitle>
        <SlideBullets
          items={[
            'Отток снижается с 8% до 5% за год',
            'Доля ручных операций падает вдвое',
            'Две ключевые роли закрыты в первом полугодии',
          ]}
        />
        <SlideTakeaway>Метрики заданы заранее, прогресс виден поквартально.</SlideTakeaway>
      </SlideFrame>,
    ],
  },
]
