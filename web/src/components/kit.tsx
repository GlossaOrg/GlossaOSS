import { ChevronDownIcon } from 'lucide-react'
import { cn } from 'cn'
import { Dot } from '@/components/locale'
import { roles, type Role } from '@/lib/projects'

/**
 * The small pieces every screen shares, in the one look they share. Colour belongs to languages,
 * so a badge is neutral and says what it means in words; a state gets a dot, nothing more.
 */
export function Badge({ children, dot, className }: { children: React.ReactNode; dot?: string; className?: string }) {
  return (
    <span className={cn('bg-secondary inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', className)}>
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />}
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
          <Dot locale={locale} className="size-2" />
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
    <div className={cn('flex w-fit flex-wrap', loose ? 'gap-2' : 'bg-secondary rounded-full p-1')}>
      {options.map((o) => (
        <label
          key={String(o.value)}
          className={cn(
            'has-focus-visible:ring-ring/25 cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 has-focus-visible:ring-3',
            loose
              ? 'bg-secondary not-has-checked:hover:bg-accent has-checked:bg-primary has-checked:text-primary-foreground'
              : 'text-muted-foreground not-has-checked:hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm',
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

/** The browser's own select, dressed as a pill. `lead` sits inside it on the left, such as a language's dot. */
export function Select({ lead, className, children, ...props }: React.ComponentProps<'select'> & { lead?: React.ReactNode }) {
  return (
    <span className={cn('relative inline-flex max-w-full items-center', className)}>
      {lead && <span className="pointer-events-none absolute left-3.5 flex">{lead}</span>}
      <select
        {...props}
        className={cn(
          'bg-secondary hover:bg-accent focus-visible:ring-ring/25 h-10 w-full max-w-full cursor-pointer appearance-none truncate rounded-full pr-10 text-sm font-semibold outline-none focus-visible:ring-3 disabled:cursor-default disabled:opacity-60',
          lead ? 'pl-8' : 'pl-4',
        )}
      >
        {children}
      </select>
      <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute right-3.5 size-4" />
    </span>
  )
}
