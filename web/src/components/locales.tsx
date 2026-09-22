import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { cn } from 'cn'
import { Language, languageName } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useProject } from '@/lib/projects'
import { counting, useLocale, type Locale } from '@/lib/content'

const unfold = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: [0.2, 0, 0, 1] },
} as const

/** §5 and §6: which languages a project speaks, and what CLDR asks of each. */
export function Locales() {
  const project = useProject().project!
  const { rows, source, locales } = useLocale(project.id)
  const ordered = [...rows].sort((a, b) => Number(b.source) - Number(a.source) || a.locale.localeCompare(b.locale))
  const [adding, setAdding] = useState(false)

  return (
    <div className="page grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="mb-2">Locales</h2>
          <p className="text-muted-foreground text-[17px]">
            {source ? `Content is authored in ${languageName(source.locale)} and translated into the rest.` : 'Start with the language content is authored in.'}
          </p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <PlusIcon className="transition-transform duration-300 motion-safe:group-hover/button:rotate-90" />
          Add locale
        </Button>
      </header>

      <AnimatePresence initial={false}>
        {adding && <Adder key="adder" projectId={project.id} first={!source} onDone={() => setAdding(false)} />}
      </AnimatePresence>

      {locales.error ? (
        <p role="alert" className="text-destructive">Could not load the locales. Reload the page.</p>
      ) : !locales.data ? (
        <div className="divide-y border-y" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-3.5" style={{ opacity: 1 - i * 0.3 }}>
              <Skeleton className="h-5 w-64" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground border-y py-10">No locales yet. The first one you add is the source.</p>
      ) : (
        <div className="border-y">
          <div className={cn('text-muted-foreground hidden border-b py-2 md:grid', columns)}>
            <span className="eyebrow">Language</span>
            <span className="eyebrow">Falls back to</span>
            <span className="eyebrow">Plural forms</span>
            <span className="eyebrow">Ordinal forms</span>
          </div>
          <ul className="divide-y">
            <AnimatePresence initial={false}>
              {ordered.map((l) => (
                <motion.li key={l.locale} layout="position" {...unfold} className="overflow-hidden">
                  <Row locale={l} all={rows} projectId={project.id} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </div>
  )
}

/** One grid for the header and every row, so the columns line up whatever a language is called. */
const columns = 'md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1fr)_2rem] md:items-center gap-x-6'

function Row({ locale, all, projectId }: { locale: Locale; all: Locale[]; projectId: number }) {
  const client = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const path = `/api/projects/${projectId}/locales/${encodeURIComponent(locale.locale)}`
  const settle = () => Promise.all([client.invalidateQueries({ queryKey: ['locales', projectId] }), client.invalidateQueries({ queryKey: ['resources', projectId] })])
  const save = useMutation({
    mutationFn: (fallbackLocale: string | null) => api(path, { method: 'PUT', json: { source: locale.source, fallbackLocale } }),
    onSuccess: settle,
  })
  const remove = useMutation({ mutationFn: () => api(path, { method: 'DELETE' }), onSuccess: settle })

  // A fallback may not cycle, and the server is the one that guarantees it; the options just
  // never offer a locale that already falls back here.
  const reaches = (from: string): boolean => {
    for (let at: string | null = from; at; at = all.find((l) => l.locale === at)?.fallbackLocale ?? null) {
      if (at === locale.locale) return true
    }
    return false
  }
  const options = all.filter((l) => l.locale !== locale.locale && !reaches(l.locale))
  const failure = (save.error ?? remove.error) as { detail?: string } | null

  return (
    <div className="group/row py-3">
      <div className={cn('grid gap-y-2', columns)}>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Language locale={locale.locale} />
          {locale.source && <span className="bg-brand/10 text-brand rounded-full px-2 py-px text-[11px] font-medium">source</span>}
          {locale.rtl && <span className="bg-muted text-muted-foreground rounded-full px-2 py-px text-[11px] font-medium">rtl</span>}
        </span>
        {locale.source ? (
          <span className="text-muted-foreground text-sm">Written here first</span>
        ) : (
          <select
            value={locale.fallbackLocale ?? ''}
            disabled={save.isPending}
            aria-label={`${languageName(locale.locale)} falls back to`}
            onChange={(e) => save.mutate(e.target.value || null)}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full max-w-64 rounded-lg border px-2 text-sm outline-none focus-visible:ring-3"
          >
            <option value="">No fallback</option>
            {options.map((l) => <option key={l.locale} value={l.locale}>{languageName(l.locale)} ({l.locale})</option>)}
          </select>
        )}
        <Forms title="Plural forms" forms={counting(locale.cardinal)} samples={locale.cardinal} />
        <Forms title="Ordinal forms" forms={counting(locale.ordinal)} samples={locale.ordinal} />
        <span className="flex justify-end">
          {!locale.source && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${languageName(locale.locale)}`}
              onClick={() => setConfirming(true)}
              className={cn('text-muted-foreground hover:text-destructive transition-opacity md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100', confirming && 'md:opacity-100')}
            >
              <Trash2Icon />
            </Button>
          )}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {confirming && (
          <motion.div {...unfold} className="overflow-hidden">
            <div className="bg-destructive/5 mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg py-2 pr-2 pl-4 text-sm">
              <p className="min-w-60 flex-1">
                Every translation, release and history entry in {languageName(locale.locale)} goes with it. This cannot be undone.
              </p>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>Remove locale</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {failure ? <p role="alert" className="text-destructive mt-2 text-xs">{failure.detail ?? 'Could not save.'}</p> : null}
    </div>
  )
}

function Forms({ title, forms, samples }: { title: string; forms: string[]; samples: Record<string, string[]> }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="text-muted-foreground w-24 text-xs md:hidden">{title}</span>
      {forms.map((f) => (
        <span key={f} title={samples[f]?.join(', ')} className="bg-muted rounded-md px-1.5 py-px font-mono text-xs">{f}</span>
      ))}
    </span>
  )
}

/** The server canonicalizes the tag and refuses what ICU has no data for, so it is the only validator. */
function Adder({ projectId, first, onDone }: { projectId: number; first: boolean; onDone: () => void }) {
  const client = useQueryClient()
  const [tag, setTag] = useState('')
  const add = useMutation({
    mutationFn: () =>
      api(`/api/projects/${projectId}/locales/${encodeURIComponent(tag.trim())}`, { method: 'PUT', json: { source: first, fallbackLocale: null } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['locales', projectId] })
      onDone()
    },
  })

  return (
    <motion.div {...unfold} className="overflow-hidden">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
        className="border-brand grid gap-4 border-l-2 py-1 pl-6"
      >
        <label className="grid max-w-xs gap-1.5">
          <span className="text-sm font-medium">{first ? 'Source locale' : 'Locale'}</span>
          <Input value={tag} onChange={(e) => setTag(e.target.value)} required autoFocus maxLength={35} placeholder="pt-BR" className="bg-background font-mono" />
          <span className="text-muted-foreground text-xs">A BCP 47 tag. {first ? 'This one cannot change later.' : ''}</span>
        </label>
        {add.error ? <p role="alert" className="text-destructive text-sm">{(add.error as { detail?: string }).detail ?? 'Could not add it.'}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={add.isPending}>Add</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </motion.div>
  )
}
