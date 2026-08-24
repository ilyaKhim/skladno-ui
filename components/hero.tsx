import { FileSpreadsheet, FileText, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  SlideEyebrow,
  SlideFrame,
  SlideStages,
  SlideTakeaway,
  SlideTitle,
} from '@/components/slide-frame'

export function Hero() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="flex flex-col items-start gap-5">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
            Сервис в разработке
          </p>

          <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance md:text-6xl">
            Рабочая презентация из ваших материалов за несколько минут
          </h1>

          <p className="max-w-[62ch] text-lg leading-relaxed text-muted-foreground text-pretty">
            Презентации, которые не стыдно отправить клиенту или руководителю. Опишите задачу или
            загрузите текст, документ либо таблицу — «Складно» соберет структуру, напишет черновик и
            оформит слайды.
          </p>

          <div className="flex w-full flex-col gap-3 pt-2 sm:w-auto sm:flex-row sm:items-center">
            <Button size="lg" nativeButton={false} render={<a href="#early-access" />}>
              Получить ранний доступ
            </Button>
            <Button
              size="lg"
              variant="ghost"
              nativeButton={false}
              render={<a href="#examples" />}
            >
              Посмотреть примеры
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Сервис еще не запущен. Ранний доступ — по заявке.
          </p>
        </div>

        <div className="pt-12 md:pt-16">
          <ProductPreview />
        </div>
      </div>
    </section>
  )
}

/**
 * Input on the left, resulting slide on the right — the whole product in one
 * frame. Hand-built markup standing in for a real interface screenshot.
 */
function ProductPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-card slide-shadow">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-3">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        <p className="ml-2 text-xs font-medium text-muted-foreground">
          Складно — новая презентация
        </p>
      </div>

      <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-8 md:p-6">
        {/* input column */}
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Задача
            </p>
            <div className="mt-2 rounded-lg border border-border bg-background p-3">
              <p className="text-sm leading-relaxed text-foreground text-pretty">
                Собрать отчет по заявкам за квартал для руководителя. Показать динамику и объяснить,
                почему не нужен найм.
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Материалы
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              <li className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2">
                <FileSpreadsheet aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span className="truncate text-sm text-foreground">заявки-q1.xlsx</span>
              </li>
              <li className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2">
                <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span className="truncate text-sm text-foreground">заметки-с-планерок.docx</span>
              </li>
            </ul>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-primary-foreground">
            <Sparkles aria-hidden="true" className="size-4 shrink-0" />
            <span className="text-sm font-medium">Собрать презентацию</span>
          </div>
        </div>

        {/* output column */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Результат
          </p>
          <SlideFrame dense>
            <SlideEyebrow>Отчет за квартал</SlideEyebrow>
            <SlideTitle>Объем растет без расширения команды</SlideTitle>
            <SlideStages
              items={[
                { label: '34 заявки', note: 'Закрыто за квартал' },
                { label: '5 часов', note: 'Среднее время ответа' },
                { label: '2 процесса', note: 'Переведены в регламент' },
              ]}
            />
            <SlideTakeaway>Найм не требуется — узкое место в описании процессов.</SlideTakeaway>
          </SlideFrame>
        </div>
      </div>
      <figcaption className="sr-only">
        Интерфейс сервиса: слева описание задачи и загруженные файлы, справа готовый слайд.
      </figcaption>
    </figure>
  )
}
