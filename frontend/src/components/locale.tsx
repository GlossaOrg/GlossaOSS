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

const sampled = new Set<string>()

/**
 * Samples a flag's dominant colour into `--flag-<tag>` on the root, once per tag: every language wears
 * its own flag's colour, whatever the language. Greys, whites and blacks never win, so Germany is red
 * or gold, not black. Until the flag has loaded the fallback grey stands in.
 */
function sample(tag: string) {
  if (sampled.has(tag) || typeof document === 'undefined') return
  sampled.add(tag)
  const img = new Image()
  img.onload = () => {
    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(img, 0, 0, size, size)
    const px = ctx.getImageData(0, 0, size, size).data
    const buckets = new Map<number, [number, number, number, number]>()
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]]
      if (a < 200 || Math.max(r, g, b) - Math.min(r, g, b) < 48) continue
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
      const bucket = buckets.get(key) ?? [0, 0, 0, 0]
      buckets.set(key, [bucket[0] + 1, bucket[1] + r, bucket[2] + g, bucket[3] + b])
    }
    const top = [...buckets.values()].sort((a, b) => b[0] - a[0])[0]
    if (top) document.documentElement.style.setProperty(variable(tag), `rgb(${top.slice(1).map((c) => Math.round(c / top[0])).join(' ')})`)
  }
  img.src = flag(tag)
}

const variable = (tag: string) => `--flag-${tag.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

/** A language's colour, sampled from its flag: `shade` for thin marks, `tint` its pastel for what sits behind text. */
export function shade(tag: string) {
  sample(tag)
  return `var(${variable(tag)}, #A1A1AA)`
}
export const tint = (tag: string) => `color-mix(in oklab, ${shade(tag)} 12%, white)`

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
