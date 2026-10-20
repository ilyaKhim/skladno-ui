import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type OptionCardProps = {
  type: 'radio' | 'checkbox'
  name: string
  value: string
  label: string
  checked: boolean
  onChange: () => void
}

export function OptionCard({ type, name, value, label, checked, onChange }: OptionCardProps) {
  return (
    <label
      className={cn(
        'relative flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-background px-4 py-3 text-[15px] leading-snug text-foreground transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
        checked
          ? 'border-primary bg-primary/[0.07]'
          : 'border-border hover:border-primary/40 hover:bg-primary/[0.03]',
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center border transition-colors',
          type === 'radio' ? 'rounded-full' : 'rounded-md',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
        )}
      >
        {type === 'radio' ? (
          <span className={cn('size-2 rounded-full bg-primary-foreground transition-opacity', checked ? 'opacity-100' : 'opacity-0')} />
        ) : (
          <Check className={cn('size-3.5 transition-opacity', checked ? 'opacity-100' : 'opacity-0')} strokeWidth={3} />
        )}
      </span>
      <span>{label}</span>
    </label>
  )
}
