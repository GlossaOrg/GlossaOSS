import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { cn } from 'cn'
import { Select } from '@/components/kit'
import { Dot, Monogram, languageName, tint } from '@/components/locale'
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
    <div className="page">
      <header className="mb-14 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h2>Locales</h2>
          <p className="text-muted-foreground mt-4 max-w-[46ch] text-lg">
            {source
              ? `Content is written in ${languageName(source.locale)}, then translated. Where a translation is missing, its fallback shows instead.`
              : 'Start with the language content is written in.'}
          </p>
        </div>
        <Button size="lg" onClick={() => setAdding(true)} disabled={adding}>
          <PlusIcon className="transition-transform duration-300 motion-safe:group-hover/button:rotate-90" />
          Add a language
        </Button>
      </header>

      <AnimatePresence initial={false}>
        {adding && <Adder key="adder" projectId={project.id} first={!source} onDone={() => setAdding(false)} />}
      </AnimatePresence>

      {locales.error ? (
        <p role="alert" className="text-destructive">Could not load the locales. Reload the page.</p>
      ) : !locales.data ? (
        <div className="grid gap-4" aria-busy>
          <Skeleton className="h-28 rounded-[28px]" />
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" style={{ opacity: 1 - i * 0.3 }} />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground border-foreground border-t py-10 text-lg">No languages yet. The first one you add is the one content is written in.</p>
      ) : (
        <>
          {source && <Source locale={source} />}
          <ul className="border-foreground border-t">
            <AnimatePresence initial={false}>
              {ordered.filter((l) => !l.source).map((l) => (
                <motion.li key={l.locale} layout="position" {...unfold} className="overflow-hidden border-b">
                  <Row locale={l} all={rows} projectId={project.id} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </div>
  )
}

/** The language everything is written in first: not a row among the others. */
function Source({ locale }: { locale: Locale }) {
  return (
    <div className="text-on-tint mb-10 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[28px] p-7" style={{ background: tint(locale.locale) }}>
      <span className="font-heading text-[56px] leading-[0.8] font-extrabold tracking-[-0.05em]">{locale.locale}</span>
      <span className="min-w-0 flex-1">
        <span className="font-heading block text-2xl leading-tight font-bold tracking-[-0.025em]">{languageName(locale.locale)}</span>
        <span className="block opacity-65">Every message is written here first · {counting(locale.cardinal).join(', ')}</span>
      </span>
      <span className="rounded-full bg-[#0E0E0E] px-3 py-1 text-[13px] font-semibold text-white">Source</span>
    </div>
  )
}

/** One grid for every row, so the columns line up whatever a language is called. */
const columns = 'md:grid-cols-[3.5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_2.5rem]'

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
    <div className="group/row py-5">
      <div className={cn('grid grid-cols-[3.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-5 gap-y-3', columns)}>
        <Monogram locale={locale.locale} className="size-14 rounded-[18px]" />
        <span className="min-w-0">
          <span className="font-heading block truncate text-2xl leading-tight font-bold tracking-[-0.025em]">{languageName(locale.locale)}</span>
          <span className="text-muted-foreground block text-sm">{locale.rtl ? 'Right to left' : locale.locale}</span>
        </span>
        <span className="col-span-2 col-start-2 row-start-2 md:col-span-1 md:col-start-auto md:row-start-auto">
          <span className="eyebrow mb-1 block">Falls back to</span>
          <Select
            lead={locale.fallbackLocale && <Dot locale={locale.fallbackLocale} />}
            value={locale.fallbackLocale ?? ''}
            disabled={save.isPending}
            aria-label={`${languageName(locale.locale)} falls back to`}
            onChange={(e) => save.mutate(e.target.value || null)}
          >
            <option value="">Nothing</option>
            {options.map((l) => <option key={l.locale} value={l.locale}>{languageName(l.locale)}</option>)}
          </Select>
        </span>
        <span className="col-span-2 col-start-2 row-start-3 md:col-span-1 md:col-start-auto md:row-start-auto">
          <Forms cardinal={locale.cardinal} ordinal={locale.ordinal} />
        </span>
        <span className="col-start-3 row-start-1 flex justify-end md:col-start-auto md:row-start-auto">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${languageName(locale.locale)}`}
            onClick={() => setConfirming(true)}
            className={cn('text-muted-foreground hover:text-destructive transition-opacity md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100', confirming && 'md:opacity-100')}
          >
            <Trash2Icon />
          </Button>
        </span>
      </div>

      <AnimatePresence initial={false}>
        {confirming && (
          <motion.div {...unfold} className="overflow-hidden">
            <div className="bg-destructive/6 mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl py-3 pr-3 pl-5 text-sm">
              <p className="min-w-60 flex-1">
                Every translation, release and history entry in {languageName(locale.locale)} goes with it. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>Remove {languageName(locale.locale)}</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {failure ? <p role="alert" className="text-destructive mt-2 text-xs">{failure.detail ?? 'Could not save.'}</p> : null}
    </div>
  )
}

/** CLDR's categories as words; hovering one shows the numbers that take it. */
function Forms({ cardinal, ordinal }: { cardinal: Record<string, string[]>; ordinal: Record<string, string[]> }) {
  const words = (samples: Record<string, string[]>) =>
    counting(samples).map((f, i) => (
      <span key={f} title={samples[f]?.join(', ')} className="cursor-help">
        {i > 0 && ', '}
        {f}
      </span>
    ))
  return (
    <>
      <span className="eyebrow mb-1 block">Plural forms</span>
      <span className="block text-sm font-medium">{words(cardinal)}</span>
      <span className="text-muted-foreground block text-sm">Ordinal: {words(ordinal)}</span>
    </>
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
        className="mb-10 grid gap-4 rounded-[28px] border p-7"
      >
        <label className="grid max-w-xs gap-1.5">
          <span className="text-sm font-semibold">{first ? 'The language content is written in' : 'Language'}</span>
          <Input value={tag} onChange={(e) => setTag(e.target.value)} required autoFocus maxLength={35} placeholder="pt-BR" className="font-mono" />
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
