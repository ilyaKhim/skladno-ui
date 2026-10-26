'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const QUICK_ACTIONS = [
  'Сократить текст блока',
  'Сделать формулировку убедительнее',
  'Предложить три варианта заголовка',
  'Проверить согласованность цифр в презентации',
]

export function AiAssistantTrigger({ contextLabel }: { contextLabel: string | null }) {
  const [lastAction, setLastAction] = useState<string | null>(null)

  return (
    <Popover onOpenChange={(open) => !open && setLastAction(null)}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="absolute right-4 bottom-4 z-10 bg-card shadow-sm"
          />
        }
      >
        <Sparkles className="text-primary" />
        AI-помощник
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium text-foreground">AI-помощник</p>
            <p className="text-xs text-muted-foreground">
              {contextLabel ? `Контекст: ${contextLabel}` : 'Контекст: весь слайд'}
            </p>
          </div>
          <ul className="flex flex-col gap-1">
            {QUICK_ACTIONS.map((action) => (
              <li key={action}>
                <button
                  type="button"
                  onClick={() => setLastAction(action)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {action}
                </button>
              </li>
            ))}
          </ul>
          <p role="status" aria-live="polite" className="border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
            {lastAction
              ? `«${lastAction}» — в прототипе действие не выполняется.`
              : 'Подключение к генерации появится на этапе интеграции.'}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
