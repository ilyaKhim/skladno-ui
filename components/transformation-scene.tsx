import { cn } from '@/lib/utils'
import {
  SlideBars,
  SlideBullets,
  SlideEyebrow,
  SlideFrame,
  SlideTakeaway,
  SlideTitle,
} from '@/components/slide-frame'

/** Deliberately messy source material: a dense note with a raw table. */
function MessySource() {
  return (
    <div className="@container flex h-full flex-col justify-center rounded-md border border-navy-foreground/15 bg-white p-[5cqw] text-[#101828]">
      <p className="text-[3.2cqw] font-bold text-[#101828]">Итоги квартала — заметки</p>
      <p className="mt-[2cqw] text-[2.3cqw] leading-snug text-[#566072]">
        закрыли 34 заявки, было 28 в том квартале. время ответа упало с 9ч до 5ч. два процесса
        перевели в регламент, передали новым людям. найм пока не открываем, загрузки не хватает.
      </p>
      <table className="mt-[3cqw] w-full border-collapse text-left text-[2cqw]">
        <thead>
          <tr>
            <th className="border-b border-[#d8dee7] pb-[1cqw] font-medium text-[#566072]">Месяц</th>
            <th className="border-b border-[#d8dee7] pb-[1cqw] font-medium text-[#566072]">Заявки</th>
            <th className="border-b border-[#d8dee7] pb-[1cqw] font-medium text-[#566072]">Ответ, ч</th>
          </tr>
        </thead>
        <tbody className="text-[#101828]">
          <tr>
            <td className="border-b border-[#d8dee7] py-[1cqw]">Июль</td>
            <td className="border-b border-[#d8dee7] py-[1cqw] tabular-nums">9</td>
            <td className="border-b border-[#d8dee7] py-[1cqw] tabular-nums">8</td>
          </tr>
          <tr>
            <td className="border-b border-[#d8dee7] py-[1cqw]">Август</td>
            <td className="border-b border-[#d8dee7] py-[1cqw] tabular-nums">11</td>
            <td className="border-b border-[#d8dee7] py-[1cqw] tabular-nums">6</td>
          </tr>
          <tr>
            <td className="py-[1cqw]">Сентябрь</td>
            <td className="py-[1cqw] tabular-nums">14</td>
            <td className="py-[1cqw] tabular-nums">5</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function TakeawaySlide() {
  return (
    <SlideFrame dense className="border-navy-foreground/15">
      <SlideEyebrow>Итоги квартала</SlideEyebrow>
      <SlideTitle>Очередь входящих перестала расти</SlideTitle>
      <SlideBullets
        items={['Закрыто 34 заявки против 28 в прошлом квартале', 'Время ответа сократилось с 9 до 5 часов']}
      />
      <SlideTakeaway>Прирост дали регламенты, а не новые сотрудники.</SlideTakeaway>
    </SlideFrame>
  )
}

function ChartSlide() {
  return (
    <SlideFrame dense className="border-navy-foreground/15">
      <SlideEyebrow>Динамика</SlideEyebrow>
      <SlideTitle>Заявки растут, время ответа падает</SlideTitle>
      <SlideBars
        data={[
          { label: 'Июль', value: 9 },
          { label: 'Авг', value: 11 },
          { label: 'Сен', value: 14 },
        ]}
        max={14}
        unit="Заявок в месяц"
      />
    </SlideFrame>
  )
}

function NextStepSlide() {
  return (
    <SlideFrame dense className="border-navy-foreground/15">
      <SlideEyebrow>Решение</SlideEyebrow>
      <SlideTitle>Следующий шаг — закрепить регламенты письменно</SlideTitle>
      <SlideBullets
        items={['Описать оба процесса как чек-листы', 'Передать чек-листы новым сотрудникам за 2 недели']}
      />
      <SlideTakeaway>Найм откладываем — сначала фиксируем то, что уже сработало.</SlideTakeaway>
    </SlideFrame>
  )
}

const chips = ['нашли структуру', 'сократили текст', 'данные превратили в график']

export function TransformationScene() {
  return (
    <div className="rounded-2xl bg-navy px-5 py-10 text-navy-foreground md:px-10 md:py-14">
      <div className="flex flex-col items-stretch gap-6 md:flex-row md:items-center md:gap-8">
        {/* Left: messy source */}
        <div className="w-full md:w-[34%] md:shrink-0">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-navy-foreground/60">
            Материалы
          </p>
          <div className="aspect-video w-full">
            <MessySource />
          </div>
        </div>

        {/* Center: arrow — horizontal on desktop, vertical on mobile, never hidden */}
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center py-1 md:py-0"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-9 rotate-90 text-navy-foreground/70 md:size-12 md:rotate-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M4 12h15" strokeLinecap="round" />
            <path d="M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Right: stack of 3 finished slides */}
        <div className="w-full md:w-[46%]">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-navy-foreground/60">
            Готовые слайды
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="aspect-video w-full">
              <TakeawaySlide />
            </div>
            <div className="aspect-video w-full">
              <ChartSlide />
            </div>
            <div className="aspect-video w-full">
              <NextStepSlide />
            </div>
          </div>
        </div>
      </div>

      {/* Annotation chips */}
      <ul className="mt-8 flex flex-wrap gap-2.5">
        {chips.map((chip) => (
          <li
            key={chip}
            className={cn(
              'rounded-full border border-navy-foreground/20 bg-navy-foreground/10 px-3.5 py-1.5 text-sm font-medium text-navy-foreground',
            )}
          >
            {chip}
          </li>
        ))}
      </ul>
    </div>
  )
}
