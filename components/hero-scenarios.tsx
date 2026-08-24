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
    prompt: 'Собери персональное коммерческое предложение по нашей линейке продуктов на основе брифа клиента.',
    files: ['бриф клиента.docx', 'каталог продуктов.pdf'],
    outline: ['Титульный слайд', 'Продукты под задачу клиента', 'Условия и цена', 'Следующий шаг'],
    slides: [
      <SlideFrame dense key="proposal-1">
        <SlideEyebrow>Коммерческое предложение</SlideEyebrow>
        <SlideTitle>Продукты под задачу клиента</SlideTitle>
        <SlideStages
          items={[
            { label: 'Бриф клиента', note: 'Задача и требования' },
            { label: 'Каталог продуктов', note: 'Подходящая линейка' },
            { label: 'Готовое КП', note: 'Условия и цена' },
          ]}
        />
        <SlideTakeaway>Предложение собрано под конкретного покупателя, а не по общему шаблону.</SlideTakeaway>
      </SlideFrame>,
      <SlideFrame dense key="proposal-2">
        <SlideEyebrow>Условия и цена</SlideEyebrow>
        <SlideTitle>Что видит клиент</SlideTitle>
        <SlideBullets
          items={[
            'Продукты подобраны под бриф, а не под весь каталог',
            'Условия и цена — на отдельном слайде',
            'Понятный следующий шаг для клиента',
          ]}
        />
        <SlideTakeaway>КП говорит о задаче клиента, а не о каталоге целиком.</SlideTakeaway>
      </SlideFrame>,
    ],
  },
  {
    id: 'status-meeting',
    chip: 'Статус-встреча',
    prompt: 'Собери короткую презентацию к статус-встрече команды по текущим задачам.',
    files: ['доска задач.pdf'],
    outline: ['Что сделано', 'Что в работе', 'Блокеры и помощь'],
    slides: [
      <SlideFrame dense key="status-1">
        <SlideEyebrow>Статус-встреча</SlideEyebrow>
        <SlideTitle>Что сделано и что в работе</SlideTitle>
        <SlideStages
          items={[
            { label: 'Сделано', note: 'Закрытые задачи' },
            { label: 'В работе', note: 'Текущий фокус' },
            { label: 'Блокеры', note: 'Нужна помощь' },
          ]}
        />
        <SlideTakeaway>Статус собран по трём блокам, встреча не уходит в детали каждой задачи.</SlideTakeaway>
      </SlideFrame>,
      <SlideFrame dense key="status-2">
        <SlideEyebrow>Блокеры</SlideEyebrow>
        <SlideTitle>Что нужно от команды</SlideTitle>
        <SlideBullets
          items={[
            'Одна задача ждёт решения по приоритету',
            'Нужна проверка перед релизом',
            'Следующий чек-ин — через неделю',
          ]}
        />
        <SlideTakeaway>Встреча заканчивается конкретным действием, а не списком задач.</SlideTakeaway>
      </SlideFrame>,
    ],
  },
  {
    id: 'report',
    chip: 'Отчёт руководителю',
    prompt: 'Собери отчёт за квартал по выгрузке заявок и рабочим заметкам.',
    files: ['заявки-q1.pdf', 'заметки.docx'],
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
]
