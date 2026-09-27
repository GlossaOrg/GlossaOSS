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

/** The best-known languages get a pastel each, so no two of them ever share one. */
const known: Record<string, number> = { en: 0, it: 1, fr: 2, de: 3, ar: 4, pt: 5, es: 6, nl: 7 }

/**
 * Which of the eight pastels (`--lang-N` in index.css) a language wears. By tag, not by project:
 * Italian is the same pink everywhere. A regional variant sits three to seven pastels on from its
 * language, by its region, so French and Canadian French, or two Englishes, never share one.
 * ponytail: past the eight known languages two can land on the same pastel; the flag still tells them apart.
 */
export function hue(tag: string) {
  const [language, ...rest] = tag.toLowerCase().split(/[-_]/)
  const sum = (text: string) => [...text].reduce((total, c) => total + c.charCodeAt(0), 0)
  const base = known[language] ?? sum(language) % 8
  return rest.length ? (base + 3 + (sum(rest.join('-')) % 5)) % 8 : base
}

/** A language's pastel, for what sits behind text; `shade` is its stronger tone, for thin marks. */
export const tint = (tag: string) => `var(--lang-${hue(tag)})`
export const shade = (tag: string) => `var(--lang-${hue(tag)}-v)`

/** A language as its flag: the one mark that names it wherever its name is not written out. */
export function Flag({ locale, className }: { locale: string; className?: string }) {
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
