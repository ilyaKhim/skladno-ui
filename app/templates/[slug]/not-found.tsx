import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

export default function TemplateNotFound() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="bg-background">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-5 py-24 md:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">ШАБЛОН НЕ НАЙДЕН</p>
            <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
              Такого шаблона не существует
            </h1>
            <p className="max-w-[52ch] text-base leading-relaxed text-muted-foreground text-pretty">
              Возможно, ссылка устарела или шаблон был переименован. Вернитесь в каталог, чтобы найти подходящий
              вариант.
            </p>
            <Button size="lg" nativeButton={false} render={<Link href="/templates" />} className="mt-2">
              Все шаблоны
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
