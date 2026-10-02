import { useEffect } from 'react'
import { CheckIcon, ChevronDownIcon, CircleXIcon } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { flagColor } from '@/lib/color'

/**
 * circle-flags, bundled rather than fetched from its CDN: a self-hosted install must not tell a
 * third party which languages a project speaks, nor break when it cannot reach one. `no-inline`
 * keeps each SVG a file of its own, fetched only when a flag is actually shown.
 */
const countries = import.meta.glob<string>('../../node_modules/circle-flags/flags/*.svg', { query: '?no-inline', import: 'default', eager: true })
const languages = import.meta.glob<string>('../../node_modules/circle-flags/flags/language/*.svg', { query: '?no-inline', import: 'default', eager: true })
const byName = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]))
const country = byName(countries)
const language = byName(languages)

const names = new Intl.DisplayNames(['en'], { type: 'language' })

/** The region's flag when the tag names one, the language's own otherwise, a neutral one failing both. */
function flag(tag: string) {
  try {
    const parsed = new Intl.Locale(tag)
    return country[parsed.region?.toLowerCase() ?? ''] ?? language[parsed.language] ?? country.xx
  } catch {
    return country.xx
  }
}

/** "Arabic (Saudi Arabia)" for `ar-SA`, the way a person names a language. */
export function languageName(tag: string) {
  try {
    return names.of(tag) ?? tag
  } catch {
    return tag
  }
}

const colors = new Map<string, Promise<string | undefined>>()
const inferred = new Set<string>()
const variable = (tag: string) => `--flag-${tag.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

/** Reads one already-cached SVG asset per flag; no canvas, image decoding or pixel scan. */
function infer(tag: string) {
  if (inferred.has(tag)) return
  inferred.add(tag)
  const url = flag(tag)
  let color = colors.get(url)
  if (!color) {
    color = fetch(url).then((response) => response.ok ? response.text() : '').then(flagColor).catch(() => undefined)
    colors.set(url, color)
  }
  color.then((value) => value && document.documentElement.style.setProperty(variable(tag), value))
}

/** A language's pastel, for what sits behind text; `shade` is the flag colour for thin marks. */
export const shade = (tag: string) => `var(${variable(tag)}, #A1A1AA)`
export const tint = (tag: string) => `color-mix(in oklab, ${shade(tag)} 14%, var(--card))`

/** A language as its flag: the one mark that names it wherever its name is not written out. */
export function Flag({ locale, className }: { locale: string; className?: string }) {
  useEffect(() => infer(locale), [locale])
  return <img src={flag(locale)} alt="" title={languageName(locale)} draggable={false} className={cn('size-5 shrink-0 rounded-full', className)} />
}

/** The standard way a locale is named anywhere in the app: its flag, its name, and the tag itself. */
export function Language({ locale, className, tag = true }: { locale: string; className?: string; tag?: boolean }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Flag locale={locale} className="size-[1.2em]" />
      <span className="truncate font-medium">{languageName(locale)}</span>
      {tag && <span className="text-muted-foreground font-mono text-[0.8em] whitespace-nowrap">{locale}</span>}
    </span>
  )
}

/** The shared language picker: every language is identified by the same flag and name. */
export function LocaleSelect({ value, options, onChange, emptyLabel, label = 'Language', disabled, className }: {
  value: string | null
  options: { locale: string; source?: boolean }[]
  onChange: (locale: string | null) => void
  emptyLabel?: string
  label?: string
  disabled?: boolean
  className?: string
}) {
  const selected = options.find((option) => option.locale === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={<Button variant="outline" aria-label={label} className={cn('min-w-48 justify-start', className)} />}
      >
        {selected ? <Flag locale={selected.locale} className="size-4" /> : <CircleXIcon className="text-muted-foreground size-4" />}
        <span className="min-w-0 flex-1 truncate text-left">{selected ? languageName(selected.locale) : emptyLabel}</span>
        <ChevronDownIcon className="text-muted-foreground size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        {emptyLabel && (
          <DropdownMenuItem onClick={() => onChange(null)}>
            <CircleXIcon className="text-muted-foreground size-4" />
            <span className="min-w-0 flex-1 truncate">{emptyLabel}</span>
            {value === null && <CheckIcon className="size-4" />}
          </DropdownMenuItem>
        )}
        {options.map((option) => (
          <DropdownMenuItem key={option.locale} onClick={() => onChange(option.locale)}>
            <Flag locale={option.locale} className="size-4" />
            <span className="min-w-0 flex-1 truncate">{languageName(option.locale)}</span>
            {option.source && <span className="text-muted-foreground text-xs">Source</span>}
            {option.locale === value && <CheckIcon className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
