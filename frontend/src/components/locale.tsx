import { cn } from 'cn'

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

export function Flag({ locale, className }: { locale: string; className?: string }) {
  return <img src={flag(locale)} alt="" title={languageName(locale)} draggable={false} className={cn('size-5 shrink-0 rounded-full', className)} />
}

/** The standard way a locale is named anywhere in the app: its flag, its name, and the tag itself. */
export function Language({ locale, className, tag = true }: { locale: string; className?: string; tag?: boolean }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Flag locale={locale} />
      <span className="truncate font-medium">{languageName(locale)}</span>
      {tag && <span className="text-muted-foreground font-mono text-[0.8em] whitespace-nowrap">{locale}</span>}
    </span>
  )
}
