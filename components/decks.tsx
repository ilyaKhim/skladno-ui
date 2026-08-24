import type * as React from 'react'
import {
  SlideBars,
  SlideBullets,
  SlideEyebrow,
  SlideFrame,
  SlideStages,
  SlideSubtitle,
  SlideTable,
  SlideTakeaway,
  SlideTitle,
} from '@/components/slide-frame'

export type Deck = {
  id: string
  tab: string
  caption: string
  slides: { label: string; node: React.ReactNode }[]
}

/**
 * Demo decks. All figures inside are illustrative placeholders, not claims —
 * the page says so under the gallery.
 */
export const decks: Deck[] = [
  {
    id: 'proposal',
    tab: 'Коммерческое предложение',
    caption: 'Вход: бриф клиента и прайс. Выход: предложение с этапами и составом работ.',
    slides: [
      {
        label: 'Титульный слайд',
        node: (
          <SlideFrame>
            <SlideEyebrow>Коммерческое предложение</SlideEyebrow>
            <SlideTitle>Обновление корпоративного сайта</SlideTitle>
            <SlideSubtitle>
              Подготовлено по брифу от 14 марта. Объем работ, этапы и сроки — в следующих разделах.
            </SlideSubtitle>
            <SlideTakeaway>
              Готовы начать с аудита текущего сайта и согласовать состав работ на созвоне.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
      {
        label: 'Состав работ и этапы',
        node: (
          <SlideFrame>
            <SlideEyebrow>Состав работ</SlideEyebrow>
            <SlideTitle>Что входит в проект</SlideTitle>
            <SlideStages
              items={[
                { label: 'Аудит и структура', note: 'Разбор текущих страниц, карта разделов' },
                { label: 'Дизайн и верстка', note: 'Макеты ключевых экранов, адаптив' },
                { label: 'Запуск и передача', note: 'Перенос контента, инструкция команде' },
              ]}
            />
            <SlideTakeaway>
              Работа разбита на три этапа с отдельной приемкой — правки не переносятся в конец
              проекта.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
      {
        label: 'Сроки и объем',
        node: (
          <SlideFrame>
            <SlideEyebrow>Сроки и объем</SlideEyebrow>
            <SlideTitle>Планируемый график</SlideTitle>
            <SlideTable
              head={['Этап', 'Объем', 'Срок']}
              rows={[
                ['Аудит и структура', '1 отчет, 1 карта', '2 недели'],
                ['Дизайн и верстка', '8 экранов', '5 недель'],
                ['Запуск и передача', '1 релиз', '2 недели'],
              ]}
            />
            <SlideTakeaway>
              Общий срок — около 9 недель при согласовании макетов в течение трех рабочих дней.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
    ],
  },
  {
    id: 'report',
    tab: 'Отчет за период',
    caption: 'Вход: таблица выгрузки и рабочие заметки. Выход: итоги периода с выводами.',
    slides: [
      {
        label: 'Ключевые итоги',
        node: (
          <SlideFrame>
            <SlideEyebrow>Отчет за квартал</SlideEyebrow>
            <SlideTitle>Ключевые итоги периода</SlideTitle>
            <SlideBullets
              items={[
                'Закрыто 34 заявки — на 6 больше, чем в прошлом квартале',
                'Среднее время ответа сократилось с 9 до 5 часов',
                'Два процесса переведены в регламент и переданы новым сотрудникам',
              ]}
            />
            <SlideTakeaway>
              Рост объема закрытых заявок обеспечен регламентами, а не увеличением команды.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
      {
        label: 'Динамика по месяцам',
        node: (
          <SlideFrame>
            <SlideEyebrow>Динамика</SlideEyebrow>
            <SlideTitle>Закрытые заявки по месяцам</SlideTitle>
            <SlideBars
              data={[
                { label: 'Янв', value: 8 },
                { label: 'Фев', value: 11 },
                { label: 'Мар', value: 15 },
              ]}
              max={16}
              unit="Количество закрытых заявок, шт."
            />
            <SlideTakeaway>
              Прирост устойчивый третий месяц — очередь входящих перестала накапливаться.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
      {
        label: 'Выводы и шаги',
        node: (
          <SlideFrame>
            <SlideEyebrow>Выводы</SlideEyebrow>
            <SlideTitle>Что делаем в следующем квартале</SlideTitle>
            <SlideBullets
              items={[
                'Описать регламентом еще два повторяющихся процесса',
                'Вынести типовые вопросы в базу знаний для самообслуживания',
                'Вернуться к вопросу найма при загрузке выше 40 заявок в месяц',
              ]}
            />
            <SlideTakeaway>
              Найм пока не требуется — узкое место в описании процессов, а не в людях.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
    ],
  },
  {
    id: 'idea',
    tab: 'Защита идеи',
    caption: 'Вход: черновик мысли в заметках. Выход: структура «проблема — решение — что нужно».',
    slides: [
      {
        label: 'Проблема',
        node: (
          <SlideFrame>
            <SlideEyebrow>Проблема</SlideEyebrow>
            <SlideTitle>Заявки теряются между отделами</SlideTitle>
            <SlideBullets
              items={[
                'Передача заявки идет в переписке, статус нигде не фиксируется',
                'Клиент узнает о задержке раньше, чем ответственный',
                'Разбор одного спорного случая занимает у руководителя до часа',
              ]}
            />
            <SlideTakeaway>
              Проблема не в скорости работы, а в отсутствии единого места со статусом заявки.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
      {
        label: 'Решение',
        node: (
          <SlideFrame>
            <SlideEyebrow>Предлагаемое решение</SlideEyebrow>
            <SlideTitle>Единая доска заявок со статусами</SlideTitle>
            <SlideStages
              items={[
                { label: 'Одна точка входа', note: 'Все заявки попадают в общий список' },
                { label: 'Явный ответственный', note: 'У каждой заявки есть владелец и срок' },
                { label: 'Видимый статус', note: 'Руководитель видит картину без запросов' },
              ]}
            />
            <SlideTakeaway>
              Решение не требует нового софта — достаточно настроить существующий трекер.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
      {
        label: 'Что нужно для запуска',
        node: (
          <SlideFrame>
            <SlideEyebrow>Что нужно для запуска</SlideEyebrow>
            <SlideTitle>Ресурсы и первый шаг</SlideTitle>
            <SlideTable
              head={['Ресурс', 'Объем', 'От кого']}
              rows={[
                ['Настройка трекера', '~3 дня', 'Внутренними силами'],
                ['Согласование правил', '1 встреча', 'Руководители отделов'],
                ['Пилот на одном отделе', '3 недели', 'Отдел поддержки'],
              ]}
            />
            <SlideTakeaway>
              Предлагаю начать с пилота на одном отделе и вернуться с результатами через месяц.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
    ],
  },
]
