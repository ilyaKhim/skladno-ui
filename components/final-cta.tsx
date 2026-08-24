import { Button } from '@/components/ui/button'

export function FinalCta() {
  return (
    <section className="border-b border-border bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 md:flex-row md:items-center md:justify-between md:px-8 md:py-16">
        <p className="max-w-2xl font-display text-2xl font-bold leading-snug tracking-tight text-balance md:text-3xl">
          Опишите задачу — получите презентацию, которую можно отправлять.
        </p>
        <Button
          size="lg"
          variant="secondary"
          className="shrink-0"
          nativeButton={false}
          render={<a href="#early-access" />}
        >
          Получить ранний доступ
        </Button>
      </div>
    </section>
  )
}
