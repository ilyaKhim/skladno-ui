import { HeroComposer } from '@/components/hero-composer'

export function Hero() {
  return (
    <section id="top" className="border-b border-border">
      <div className="mx-auto flex max-w-2xl flex-col items-center px-5 pt-6 pb-5 text-center md:px-8 md:pt-8 md:pb-6 [@media(max-height:780px)]:pt-5 [@media(max-height:780px)]:pb-4 [@media(max-height:720px)]:pt-4 [@media(max-height:720px)]:pb-3">
        <h1 className="relative z-10 max-w-xl font-display text-[clamp(2.5rem,9.5vw,3.25rem)] font-bold leading-[1.1] tracking-tight text-balance [hyphens:none] [overflow-wrap:break-word] md:max-w-3xl md:text-[clamp(3.1rem,4.7vw,4.75rem)] md:leading-[1.08] [@media(max-height:780px)]:md:text-[clamp(2.8rem,4.3vw,3.9rem)] [@media(max-height:720px)]:md:text-[clamp(2.5rem,3.8vw,3.35rem)] [@media(max-height:720px)]:md:leading-[1.06]">
          <span className="block text-foreground">Создавайте бизнес-презентации</span>
          <span className="block">
            <span className="accent-presentations-text">в 10 раз быстрее</span>
          </span>
        </h1>

        <p className="relative z-10 mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty md:mt-5 md:text-2xl [@media(max-height:720px)]:mt-3 [@media(max-height:720px)]:md:text-xl">
          GoDeck превращает документы, данные и идеи в готовые слайды под вашу задачу.
        </p>

        <p className="relative z-10 mt-2 max-w-sm text-sm text-muted-foreground text-pretty md:mt-2.5 [@media(max-height:720px)]:mt-1.5">
          Для менеджеров и специалистов, которые презентуют идеи, решения и результаты.
        </p>

        <div className="mt-5 w-full md:mt-5 [@media(max-height:720px)]:mt-3.5">
          <HeroComposer />
        </div>
      </div>
    </section>
  )
}
