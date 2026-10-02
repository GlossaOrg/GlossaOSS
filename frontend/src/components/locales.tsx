import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/kit'
import { Flag, languageName, LocaleSelect } from '@/components/locale'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
  const [adding, setAdding] = useState(false)

  return (
    <div className="page">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h2>Locales</h2>
          <p className="text-muted-foreground mt-1.5 max-w-[72ch] text-sm">
            {source
              ? `Content is written in ${languageName(source.locale)}, then translated. Where a translation is missing, its fallback shows instead.`
              : 'Start with the language content is written in.'}
          </p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <PlusIcon />
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
          <Skeleton className="h-24" />
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" style={{ opacity: 1 - i * 0.3 }} />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="card text-muted-foreground p-6">No languages yet. The first one you add is the one content is written in.</p>
      ) : (
        <>
          {source && <Source locale={source} />}
          <ul className="card px-5">
            <AnimatePresence initial={false}>
              {rows.filter((l) => !l.source).map((l) => (
                <motion.li key={l.locale} layout="position" {...unfold} className="overflow-hidden border-t first:border-t-0">
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
    <div className="card mb-3 flex flex-wrap items-center gap-x-5 gap-y-3 p-5">
      <Flag locale={locale.locale} className="size-12" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2.5">
          <span className="text-2xl leading-tight font-semibold tracking-[-0.025em]">{languageName(locale.locale)}</span>
          <Badge className="bg-foreground text-background">Source</Badge>
        </span>
        <span className="text-muted-foreground mt-0.5 block text-sm">
          <span className="font-mono">{locale.locale}</span> · Every message is written here first · {counting(locale.cardinal).join(', ')} · Ordinal: {counting(locale.ordinal).join(', ')}
        </span>
      </span>
    </div>
  )
}

/** One grid for every row, so the columns line up whatever a language is called. */
const columns = 'md:grid-cols-[2.5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_2.5rem]'

function Row({ locale, all, projectId }: { locale: Locale; all: Locale[]; projectId: number }) {
  const client = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const path = `/api/projects/${projectId}/locales/${encodeURIComponent(locale.locale)}`
  const settle = () => Promise.all([client.invalidateQueries({ queryKey: ['locales', projectId] }), client.invalidateQueries({ queryKey: ['resources', projectId] })])
  const save = useMutation({
    mutationFn: (fallbackLocale: string | null) => api(path, { method: 'PUT', json: { source: locale.source, fallbackLocale } }),
    onSuccess: settle,
  })
  const remove = useMutation({
    mutationFn: () => api(path, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirming(false)
      return settle()
    },
  })

  // A fallback may not cycle, and the server is the one that guarantees it; the options just
  // never offer a locale that already falls back here.
  const reaches = (from: string): boolean => {
    for (let at: string | null = from; at; at = all.find((l) => l.locale === at)?.fallbackLocale ?? null) {
      if (at === locale.locale) return true
    }
    return false
  }
  const options = all.filter((l) => l.locale !== locale.locale && !reaches(l.locale))
  const failure = save.error as { detail?: string } | null

  return (
    <div className="group/row py-5">
      <div className={cn('grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-5 gap-y-3', columns)}>
        <Flag locale={locale.locale} className="size-10" />
        <span className="min-w-0">
          <span className="block truncate text-lg leading-tight font-medium tracking-[-0.015em]">{languageName(locale.locale)}</span>
          <span className="text-muted-foreground block font-mono text-xs">{locale.locale}{locale.rtl && ' · right to left'}</span>
        </span>
        <span className="col-span-2 col-start-2 row-start-2 md:col-span-1 md:col-start-auto md:row-start-auto">
          <span className="eyebrow mb-1 block">Falls back to</span>
          <LocaleSelect
            className="w-48"
            value={locale.fallbackLocale}
            options={options}
            emptyLabel="Nothing"
            disabled={save.isPending}
            label={`${languageName(locale.locale)} falls back to`}
            onChange={(fallback) => save.mutate(fallback)}
          />
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
            className="text-muted-foreground hover:text-destructive transition-opacity md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100"
          >
            <Trash2Icon />
          </Button>
        </span>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${languageName(locale.locale)}?`}
        description={<>Every translation, release and history entry in this language goes with it. This cannot be undone.</>}
        action={`Remove ${languageName(locale.locale)}`}
        pending={remove.isPending}
        icon={<Trash2Icon />}
        error={(remove.error as { detail?: string } | null)?.detail}
        onConfirm={() => remove.mutate()}
      />
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
        className="card mb-3 grid gap-4 p-5"
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
