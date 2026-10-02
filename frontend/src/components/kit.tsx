import { ChevronDownIcon } from 'lucide-react'
import { cn } from 'cn'
import { Flag } from '@/components/locale'
import { roles, type Role } from '@/lib/projects'

/**
 * The small pieces every screen shares, in the one look they share. A badge says what it means in
 * words — no dot beside them repeating it in colour.
 */
export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('bg-secondary inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap', className)}>
      {children}
    </span>
  )
}

/** §8's role, and the one locale it is limited to, if any. */
export function RoleBadge({ role, locale }: { role: Role; locale?: string | null }) {
  return (
    <Badge>
      {roles.find((r) => r.value === role)!.label}
      {locale && (
        <span className="text-muted-foreground inline-flex items-center gap-1 font-medium">
          <Flag locale={locale} className="size-3" />
          {locale}
        </span>
      )}
    </Badge>
  )
}

type Option<T> = { label: React.ReactNode; value: T }

/**
 * One choice of a few, as radio buttons: a segmented pill, or with `loose` a row of separate pills.
 * Controlled with `value`, or left to the form with `defaultValue`.
 */
export function Segmented<T extends string | number | boolean>({ name, options, value, defaultValue, onChange, loose }: {
  name: string
  options: Option<T>[]
  value?: T
  defaultValue?: T
  onChange?: (value: T) => void
  loose?: boolean
}) {
  return (
    <div className={cn('flex w-fit flex-wrap', loose ? 'gap-2' : 'bg-secondary rounded-lg p-1')}>
      {options.map((o) => (
        <label
          key={String(o.value)}
          className={cn(
            'has-focus-visible:ring-ring/20 cursor-pointer rounded-md px-3.5 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 has-focus-visible:ring-3',
            loose
              ? 'border-input not-has-checked:hover:border-foreground/40 has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground rounded-lg border'
              : 'text-muted-foreground not-has-checked:hover:text-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm',
          )}
        >
          <input
            type="radio"
            name={name}
            value={String(o.value)}
            {...(value === undefined ? { defaultChecked: defaultValue === o.value } : { checked: value === o.value })}
            onChange={() => onChange?.(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}

/** The browser's own select, dressed like a field. `lead` sits inside it on the left, such as a language's flag. */
export function Select({ lead, className, children, ...props }: React.ComponentProps<'select'> & { lead?: React.ReactNode }) {
  return (
    <span className={cn('relative inline-flex max-w-full items-center', className)}>
      {lead && <span className="pointer-events-none absolute left-3 flex">{lead}</span>}
      <select
        {...props}
        className={cn(
          'border-input bg-card hover:border-foreground/40 focus-visible:ring-ring/10 h-9 w-full max-w-full cursor-pointer appearance-none truncate rounded-lg border pr-9 text-sm font-medium outline-none focus-visible:ring-3 disabled:cursor-default disabled:opacity-60',
          lead ? 'pl-9' : 'pl-3',
        )}
      >
        {children}
      </select>
      <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute right-3 size-4" />
    </span>
  )
}
