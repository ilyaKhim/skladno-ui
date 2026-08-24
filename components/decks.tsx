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
    caption: 'Вход: бриф клиента и каталог продуктов. Выход: предложение под конкретную задачу клиента, а не весь каталог.',
    slides: [
      {
        label: 'Задача клиента',
        node: (
          <SlideFrame>
            <SlideEyebrow>Коммерческое предложение</SlideEyebrow>
            <SlideTitle>Что мы поняли из брифа</SlideTitle>
            <SlideSubtitle>
              Клиенту нужна линейка для оснащения нового цеха: ограниченный бюджет, срок запуска — 6 недель.
            </SlideSubtitle>
            <SlideTakeaway>
              Предложение строится вокруг этой задачи, а не вокруг полного каталога.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
      {
        label: 'Подобранные продукты',
        node: (
          <SlideFrame>
            <SlideEyebrow>Подбор из каталога</SlideEyebrow>
            <SlideTitle>Что мы предлагаем и почему</SlideTitle>
            <SlideStages
              items={[
                { label: 'Базовый комплект', note: 'Закрывает обязательный минимум оснащения' },
                { label: 'Расходные материалы', note: 'Подобраны под объем нового цеха' },
                { label: 'Сервисный пакет', note: 'Нужен из-за срока запуска в 6 недель' },
              ]}
            />
            <SlideTakeaway>
              Из каталога выбраны только позиции, закрывающие задачу клиента.
            </SlideTakeaway>
          </SlideFrame>
        ),
      },
      {
        label: 'Условия и следующий шаг',
        node: (
          <SlideFrame>
            <SlideEyebrow>Условия и цена</SlideEyebrow>
            <SlideTitle>Что дальше</SlideTitle>
            <SlideTable
              head={['Позиция', 'Условие', 'Срок']}
              rows={[
                ['Базовый комплект', 'Фиксированная цена', '3 недели'],
                ['Расходные материалы', 'Поставка партиями', 'По графику цеха'],
                ['Сервисный пакет', 'Помесячно', 'С момента запуска'],
              ]}
            />
            <SlideTakeaway>
              Готовы согласовать детали и запланировать поставку на созвоне.
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
