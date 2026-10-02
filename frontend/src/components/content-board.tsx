import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useNavigate, useSearchParams } from 'react-router'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { cn } from 'cn'
import { BulkSuggest } from '@/components/bulk-suggest'
import { Importer } from '@/components/importer'
import { Badge } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Flag, languageName, shade } from '@/components/locale'
import { Pattern } from '@/components/pattern'
import { Skeleton } from '@/components/ui/skeleton'
import { useAi } from '@/lib/ai'
import { covers, useProject, type Project } from '@/lib/projects'
import { readable, state, states, status, resourcesQuery, useLocale, useProgress, useResources, type Locale, type Progress, type Resource, type Status } from '@/lib/content'

/** Height-and-fade, the same disclosure the rest of the app uses. */
const unfold = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: [0.2, 0, 0, 1] },
} as const

/** §5's board: every resource, and what it looks like in one locale. */
export function Content() {
  const { project } = useProject()
  // A deep link can land here before a project is selected, or with none to select.
  if (!project) return <Blank title="No project yet." text="An admin creates one first." />
  return <Board project={project} />
}

function Board({ project }: { project: Project }) {
  const { rows: locales, locale, source, locales: query, select } = useLocale(project.id)
  const progress = useProgress(project.id)
  const client = useQueryClient()
  // A tab under the pointer is about to be clicked: its list is fetched before it is.
  const prefetch = (tag: string) => client.prefetchQuery(resourcesQuery(project.id, tag))
  const resources = useResources(project.id, locale?.locale)
  const [group, setGroup] = useState<string | null>(null)
  const [params] = useSearchParams()
  const [filter, setFilter] = useState<Status | null>(() => states.find((s) => s.value === params.get('status'))?.value ?? null)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const manager = covers(project.role, 'MANAGER')
  const ai = useAi().data?.available

  // Archived resources are out of every catalog, so they are out of the counts too.
  const all = useMemo(() => (resources.data ?? []).filter((r) => !r.archived), [resources.data])
  const groups = useMemo(() => {
    const counts = new Map<string, { total: number; done: number }>()
    for (const r of all) {
      const name = r.key.includes('.') ? r.key.slice(0, r.key.indexOf('.')) : 'ungrouped'
      const row = counts.get(name) ?? { total: 0, done: 0 }
      counts.set(name, { total: row.total + 1, done: row.done + (status(r) === 'approved' ? 1 : 0) })
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [all])

  const ordered = readable(locales, progress.data)

  const shown = all.filter((r) => {
    if (group && !(group === 'ungrouped' ? !r.key.includes('.') : r.key.startsWith(`${group}.`))) return false
    if (filter && status(r) !== filter) return false
    if (search && !`${r.key} ${r.sourcePayload.pattern} ${r.payload?.pattern ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (query.error) return <Blank title="This project could not be loaded." text="Reload the page." />
  if (!query.data) return null
  if (!source) {
    return (
      <Blank title={`${project.name} has no languages yet.`} text="A project needs the language it is written in before anything can be.">
        {manager && <Button size="lg" onClick={() => navigate('/locales')}>Pick the source language →</Button>}
      </Blank>
    )
  }

  return (
    <div className="page">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h2>Content</h2>
          <p className="text-muted-foreground mt-1.5 max-w-[46ch] text-[0.9375rem]">
            Every message in {project.name}, and where each one stands.
          </p>
        </div>
        <span className="flex flex-wrap gap-2">
          {locale && (locale.source ? manager : covers(project.role, 'TRANSLATOR')) && <Importer projectId={project.id} locale={locale} reviewer={covers(project.role, 'REVIEWER')} />}
          {manager && (
            <Button onClick={() => navigate('/content/new')}>
              <PlusIcon />
              New message
            </Button>
          )}
        </span>
      </header>

      {/* Every tab as wide as the groups column below, so the two line up. */}
      <div className="flex flex-wrap gap-3">
        {ordered.map((l) => (
          <LocaleTab key={l.locale} locale={l} progress={progress.data?.find((p) => p.locale === l.locale)} active={locale?.locale === l.locale} onSelect={() => select(l.locale)} onIntent={() => prefetch(l.locale)} />
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="card flex content-start gap-px self-start overflow-x-auto p-1.5 [scrollbar-width:none] lg:grid">
          <Group label="All messages" count={all.length} active={!group} onClick={() => setGroup(null)} />
          {groups.map(([name, { total, done }]) => (
            <Group key={name} label={name} count={total} done={done} active={group === name} onClick={() => setGroup(name)} />
          ))}
        </aside>

        <div className="card min-w-0 px-2 pt-2 pb-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 p-1">
            <label className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a message" aria-label="Find a message" className="h-9 w-60 rounded-lg pl-9" />
            </label>
            {states.map((s) => {
              const count = all.filter((r) => status(r) === s.value).length
              if (!count && filter !== s.value) return null
              const on = filter === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(on ? null : s.value)}
                  className={cn(
                    'focus-visible:ring-ring/20 inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-[0.8125rem] font-semibold transition-colors outline-none focus-visible:ring-3',
                    on ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent',
                  )}
                >
                  <span aria-hidden className={cn('size-1.5 rounded-full', s.dot)} />
                  {s.label}
                  <span className="opacity-55">{count}</span>
                </button>
              )
            })}
            {ai && locale && !locale.source && covers(project.role, 'TRANSLATOR') && (
              <span className="ml-auto">
                <BulkSuggest projectId={project.id} locale={locale} source={source!} rows={all} reviewer={covers(project.role, 'REVIEWER')} />
              </span>
            )}
          </div>

          {resources.error ? (
            <p role="alert" className="text-destructive py-6">Could not load the content. Reload the page.</p>
          ) : !resources.data ? (
            <div className="grid gap-3 py-2" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="grid gap-2 py-3" style={{ opacity: 1 - i * 0.22 }}>
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-6 w-full max-w-lg" />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-3 py-12">
              <p className="font-heading text-2xl font-semibold tracking-[-0.03em]">{all.length ? 'Nothing matches.' : 'No messages yet.'}</p>
              <p className="text-muted-foreground mt-1">
                {all.length ? 'Clear the search or the filter to see the rest.' : manager ? 'Write the first one and the translators can start.' : 'A manager writes the first one.'}
              </p>
            </motion.div>
          ) : (
            // Keyed by locale: switching language swaps the list in one fade instead of animating every row's height.
            <motion.ul key={locale!.locale} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: 'easeOut' }}>
              <AnimatePresence initial={false}>
                {shown.map((r) => (
                  <motion.li key={r.id} layout="position" {...unfold} className="overflow-hidden border-t">
                    <Row resource={r} locale={locale!} source={source} onOpen={() => navigate(`/content/${r.id}`)} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** A locale to switch to, filled when it is the one being looked at; the fill slides between them. */
function LocaleTab({ locale, progress, active, onSelect, onIntent }: { locale: Locale; progress?: Progress; active: boolean; onSelect: () => void; onIntent: () => void }) {
  const percent = progress?.total ? Math.floor((progress.approved / progress.total) * 100) : 0
  const still = useReducedMotion()
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      className={cn(
        'focus-visible:ring-ring/20 relative isolate flex w-52 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-4 pl-3 text-left transition-colors outline-none focus-visible:ring-3',
        active ? 'text-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      <Flag locale={locale.locale} className="size-6" />
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-[0.8438rem] font-bold">{languageName(locale.locale)}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {locale.source ? 'Source' : progress ? `${percent}% approved` : 'Counting…'}
        </span>
        {/* The source's bar is there but unseen, so every tab is the same height. */}
        <span className={cn('bg-secondary mt-1.5 block h-1 w-full overflow-hidden rounded-full', locale.source && 'invisible')}>
          <motion.span className="block h-full rounded-full" style={{ background: shade(locale.locale) }} initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: still ? 0 : 0.6, ease: [0.2, 0, 0, 1] }} />
        </span>
      </span>
      {active && <motion.span layoutId="locale-tab" aria-hidden className="bg-brand absolute inset-0 -z-10 rounded-lg" transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }} />}
    </button>
  )
}

function Row({ resource, locale, source, onOpen }: { resource: Resource; locale: Locale; source: Locale; onOpen: () => void }) {
  const s = state(status(resource))
  const dot = resource.key.lastIndexOf('.')

  return (
    <button
      type="button"
      onClick={onOpen}
      className="reveal hover:bg-secondary/70 focus-visible:bg-secondary grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 rounded-lg px-3 py-3 text-left transition-colors outline-none"
    >
      <span className="min-w-0">
        <span className="text-muted-foreground block truncate font-mono text-[12.5px]">
          {dot > 0 && resource.key.slice(0, dot + 1)}
          <span className="text-foreground font-medium">{resource.key.slice(dot + 1)}</span>
        </span>
        <span className="mt-1 block text-[0.9375rem] leading-snug">
          <Pattern text={resource.sourcePayload.pattern} rtl={source.rtl} locale={source.locale} />
        </span>
        {!locale.source && resource.payload && (
          <span className="text-muted-foreground mt-1 flex items-baseline gap-2 text-[0.9375rem] leading-snug">
            <Flag locale={locale.locale} className="size-3.5 translate-y-[2px]" />
            <Pattern text={resource.payload.pattern} rtl={locale.rtl} locale={locale.locale} />
          </span>
        )}
      </span>
      <Badge dot={s.dot} className="mt-0.5">{s.label}</Badge>
    </button>
  )
}

function Group({ label, count, done, active, onClick }: { label: string; count: number; done?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'link-bg-animated flex h-9 shrink-0 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-left text-[0.8438rem] font-semibold',
        active ? 'bg-brand text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <span className="truncate">{label}</span>
      <span className="text-muted-foreground text-xs tabular-nums">{done === undefined ? count : `${done}/${count}`}</span>
    </button>
  )
}

function Blank({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <section className="page">
      <div className="card p-6">
        <p className="font-heading text-2xl leading-tight font-extrabold tracking-[-0.03em] text-balance">{title}</p>
        <p className="text-muted-foreground mt-2 mb-5 max-w-md">{text}</p>
        {children}
      </div>
    </section>
  )
}
