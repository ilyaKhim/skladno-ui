import Link from 'next/link'
import { cn } from '@/lib/utils'
import { focusRing } from '@/lib/focus-ring'

const PLACEHOLDER = '[Текст раздела будет добавлен позднее]'

const SECTIONS = [
  'Общие положения',
  'Термины и определения',
  'Предмет договора',
  'Регистрация и использование сервиса',
  'Пробная версия',
  'Платная подписка и порядок оплаты',
  'Автоматическое продление и отмена подписки',
  'Порядок возврата денежных средств',
  'Права и обязанности пользователя',
  'Права и обязанности исполнителя',
  'Пользовательские материалы и созданные презентации',
  'Использование технологий искусственного интеллекта',
  'Ограничение ответственности',
  'Обработка персональных данных',
  'Порядок направления обращений и претензий',
  'Изменение условий оферты',
  'Реквизиты исполнителя',
] as const

const REQUISITES = [
  'Исполнитель: [ФИО индивидуального предпринимателя]',
  'ИНН: [указать ИНН]',
  'ОГРНИП: [указать ОГРНИП]',
  'Адрес: [указать адрес]',
  'Email: [указать email]',
]

const REQUISITES_INDEX = SECTIONS.length - 1

export function OfferDocument() {
  return (
    <article className="mx-auto w-full max-w-[820px] px-5 py-10 md:px-8 md:py-16">
      <Link
        href="/"
        className={cn(
          'inline-block rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground',
          focusRing,
        )}
      >
        ← На главную
      </Link>

      <header className="mt-8 md:mt-10">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Юридическая информация
        </p>
        <h1 className="mt-3 text-balance break-words text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Публичная оферта
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">Условия использования сервиса GoDeck</p>
        <p className="mt-2 text-sm text-muted-foreground">Редакция от [указать дату]</p>
      </header>

      <div className="mt-12 flex flex-col gap-10 md:mt-16 md:gap-12">
        {SECTIONS.map((title, index) => (
          <section key={title} aria-labelledby={`offer-section-${index + 1}`}>
            <h2
              id={`offer-section-${index + 1}`}
              className="break-words text-xl font-semibold tracking-tight text-foreground md:text-2xl"
            >
              {`${index + 1}. ${title}`}
            </h2>
            {index === REQUISITES_INDEX ? (
              <ul className="mt-3 flex flex-col gap-1 text-base leading-relaxed text-muted-foreground">
                {REQUISITES.map((line) => (
                  <li key={line} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">{PLACEHOLDER}</p>
            )}
          </section>
        ))}
      </div>
    </article>
  )
}
