import { cn } from 'cn'

const names = new Intl.DisplayNames(['en'], { type: 'language' })

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
 * Italian is the same pink everywhere. A regional variant sits three pastels on from its language,
 * so French and Canadian French never look like one tile twice.
 * ponytail: past the eight known languages two can land on the same pastel; the monogram still tells them apart.
 */
export function hue(tag: string) {
  const [language, ...rest] = tag.toLowerCase().split(/[-_]/)
  const base = known[language] ?? [...language].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 8
  return rest.length ? (base + 3) % 8 : base
}

export const tint = (tag: string) => `var(--lang-${hue(tag)})`

/** A language as a small pastel dot, for where its name is written out beside it. */
export function Dot({ locale, className }: { locale: string; className?: string }) {
  return <span aria-hidden title={languageName(locale)} className={cn('size-2.5 shrink-0 rounded-full', className)} style={{ background: `var(--lang-${hue(locale)}-v)` }} />
}

/** A language as its tag on its pastel, where it stands on its own. Size it with `className`. */
export function Monogram({ locale, className }: { locale: string; className?: string }) {
  return (
    <span
      aria-hidden
      title={languageName(locale)}
      className={cn('text-on-tint font-heading grid size-12 shrink-0 place-items-center rounded-2xl font-extrabold tracking-[-0.04em]', locale.length > 3 ? 'text-sm' : 'text-lg', className)}
      style={{ background: tint(locale) }}
    >
      {locale}
    </span>
  )
}

/** The standard way a locale is named anywhere in the app: its colour, its name, and the tag itself. */
export function Language({ locale, className, tag = true }: { locale: string; className?: string; tag?: boolean }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Dot locale={locale} />
      <span className="truncate font-medium">{languageName(locale)}</span>
      {tag && <span className="text-muted-foreground font-mono text-[0.8em] whitespace-nowrap">{locale}</span>}
    </span>
  )
}
